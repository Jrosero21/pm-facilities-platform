import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { aiPromptTemplates, aiPromptTemplateDefaults } from "@/server/schema";
import { NoActivePromptError, SingleActiveInvariantViolated, ActivationTargetMismatch } from "./errors";

// ── Phase 7 batch 7c — ai_prompt_templates resolver + F3 activate ─────────────────────
// The generic prompt config layer every agent resolves at runtime. Resolution falls through
// tenant -> platform default (OQ #3). Fail-closed on no row (Surface #2): a missing prompt
// must NOT silently degrade to a stale code constant, which would make agent_runs.
// prompt_version lie about what ran. Uncached in Phase 7 (single-row lookup on an
// operator-triggered path; optimize when measured).

export type ResolvedPrompt = {
  systemPrompt: string;
  userPromptTemplate: string | null;
  modelHint: string | null;
  temperature: string | null; // mysql decimal round-trips as a string
  version: number;
  source: "tenant" | "default";
};

const PROMPT_COLS = {
  systemPrompt: aiPromptTemplates.systemPrompt,
  userPromptTemplate: aiPromptTemplates.userPromptTemplate,
  modelHint: aiPromptTemplates.modelHint,
  temperature: aiPromptTemplates.temperature,
  version: aiPromptTemplates.version,
};
const DEFAULT_COLS = {
  systemPrompt: aiPromptTemplateDefaults.systemPrompt,
  userPromptTemplate: aiPromptTemplateDefaults.userPromptTemplate,
  modelHint: aiPromptTemplateDefaults.modelHint,
  temperature: aiPromptTemplateDefaults.temperature,
  version: aiPromptTemplateDefaults.version,
};

/**
 * Resolve the active prompt for an agent: tenant override -> platform default. Throws
 * NoActivePromptError when neither resolves (fail-closed — Surface #2). Callers on the real
 * (non-mock) path let it propagate so the run closes status='failed'. The mock path does
 * not call this (it records prompt_version='mock').
 */
export async function resolveActivePrompt(
  tenantId: string,
  agentId: string,
  variant = "default",
): Promise<ResolvedPrompt> {
  const tenantRows = await db
    .select(PROMPT_COLS)
    .from(aiPromptTemplates)
    .where(
      and(
        eq(aiPromptTemplates.tenantId, tenantId),
        eq(aiPromptTemplates.agentId, agentId),
        eq(aiPromptTemplates.variant, variant),
        eq(aiPromptTemplates.status, "active"),
      ),
    )
    .limit(1);
  if (tenantRows[0]) return { ...tenantRows[0], source: "tenant" };

  const defaultRows = await db
    .select(DEFAULT_COLS)
    .from(aiPromptTemplateDefaults)
    .where(
      and(
        eq(aiPromptTemplateDefaults.agentId, agentId),
        eq(aiPromptTemplateDefaults.variant, variant),
        eq(aiPromptTemplateDefaults.status, "active"),
      ),
    )
    .limit(1);
  if (defaultRows[0]) return { ...defaultRows[0], source: "default" };

  throw new NoActivePromptError(agentId, variant);
}

/**
 * Activate a tenant prompt-template row, enforcing the single-active invariant ATOMICALLY
 * (R-7.x / decision B / F3). In one txn: demote the current active row(s) for the key
 * (NO LIMIT — a second active surfaces as SingleActiveInvariantViolated rather than being
 * silently demoted), then promote the target (must affect exactly 1 row).
 *
 * The DB UNIQUE(tenant_id, agent_id, variant, version) blocks duplicate versions but does
 * NOT enforce single-active; this function is the enforcement. Tenant tables only — the
 * *_defaults tables are single-row-per-key (F1 UNIQUE) and don't need demote/promote.
 *
 * Throws: SingleActiveInvariantViolated, ActivationTargetMismatch.
 */
export async function activatePromptTemplate(input: {
  tenantId: string;
  agentId: string;
  variant: string;
  id: string;
}): Promise<void> {
  const key = `(tenant=${input.tenantId}, agent=${input.agentId}, variant=${input.variant})`;
  await db.transaction(async (tx) => {
    const demote = await tx
      .update(aiPromptTemplates)
      .set({ status: "archived" })
      .where(
        and(
          eq(aiPromptTemplates.tenantId, input.tenantId),
          eq(aiPromptTemplates.agentId, input.agentId),
          eq(aiPromptTemplates.variant, input.variant),
          eq(aiPromptTemplates.status, "active"),
        ),
      );
    // affectedRows is driver-mode invariant here: the WHERE filter (status='active') excludes
    // the new value (status='archived'), so any row matching the WHERE necessarily changes.
    // Counts are therefore identical under default mysql2 and under CLIENT_FOUND_ROWS.
    // Switching to count-then-update would introduce a within-transaction race window
    // (count, then-update) that this shape doesn't have.
    const demoted = demote[0].affectedRows;
    if (demoted > 1) throw new SingleActiveInvariantViolated("ai_prompt_templates", key, demoted);

    const promote = await tx
      .update(aiPromptTemplates)
      .set({ status: "active" })
      .where(
        and(
          eq(aiPromptTemplates.id, input.id),
          eq(aiPromptTemplates.tenantId, input.tenantId),
          eq(aiPromptTemplates.agentId, input.agentId),
          eq(aiPromptTemplates.variant, input.variant),
        ),
      );
    if (promote[0].affectedRows !== 1) throw new ActivationTargetMismatch("ai_prompt_templates", input.id);
  });
}
