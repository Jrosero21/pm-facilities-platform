import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { agentPolicies, agentPolicyDefaults, tenantAutonomySettings } from "@/server/schema";
import { SingleActiveInvariantViolated, ActivationTargetMismatch } from "./errors";

// ── Phase 7 batch 7c — agent_policies resolver + F3 activate ──────────────────────────
// The generic policy config layer. Resolution ladder (OQ #3, Surface #3):
//   (tenant, client, agent) -> (tenant, NULL client, agent) -> defaults(agent) -> fallback.
// FAIL-SAFE: no match returns { requiresReview: true } — absence of policy must NEVER mean
// auto-execute (§2.9). Uncached in Phase 7.

export type ResolvedPolicy = {
  requiresReview: boolean;
  // POLICY HALF only (Phase 23 23d): true requires BOTH an explicit policy opt-in
  // (parsed.autonomyEnabled === true) AND no kill switch. The ceiling half (committed-$ /
  // token meters) is a LATER batch — until it lands, autonomyEnabled does NOT yet imply an
  // agent may auto-execute, and no enforcement branch reads it (disposition stays
  // queued_for_review this batch).
  autonomyEnabled: boolean;
  // The tenant DIAL for the quality bar (min run-confidence the tenant demands). A tenant may
  // only TIGHTEN the platform accuracy floor — meetsQualityBar clamps effectiveFloor >= platform
  // floor, so a value below the floor is ignored. Absent → undefined (the platform floor governs
  // alone). NOT enforced here; enforcement is meetsQualityBar. Fail-safe: only the literals
  // low|medium|high are accepted; anything else parses to undefined.
  qualityThreshold?: "low" | "medium" | "high";
  raw: unknown;
  source: "kill_switch" | "tenant_client" | "tenant" | "default" | "fallback";
};

// R-6.19: MariaDB json() is physically longtext; mysql2 returns it as a STRING and Drizzle
// does not parse on read. Parse at the read boundary — WITHOUT this, `parsed.requiresReview`
// reads against the raw "{...}" string (always truthy), so a policy could never lower the
// gate by accident. Only an explicit `false` lowers it (which Phase 7 never seeds).
function toResolved(rawPolicy: unknown, source: ResolvedPolicy["source"]): ResolvedPolicy {
  let parsed: unknown = rawPolicy;
  if (typeof rawPolicy === "string") {
    try {
      parsed = JSON.parse(rawPolicy);
    } catch {
      parsed = null;
    }
  }
  const requiresReview = (parsed as { requiresReview?: unknown } | null)?.requiresReview !== false;
  // POLICY HALF of autonomyEnabled — explicit-true required, mirroring the requiresReview
  // fail-safe discipline (anything other than literal `true` keeps autonomy OFF). No ceiling
  // check here (later batch). Phase 23 23d seeds nothing that sets this, so it resolves false.
  const autonomyEnabled = (parsed as { autonomyEnabled?: unknown } | null)?.autonomyEnabled === true;
  // Quality DIAL — the tenant's min-confidence demand. Fail-safe: accept only the literal
  // low|medium|high; any other value (or absent) → undefined (platform floor governs alone).
  // Never enforced here; meetsQualityBar clamps it so it can only tighten, never lower.
  const qtRaw = (parsed as { qualityThreshold?: unknown } | null)?.qualityThreshold;
  const qualityThreshold =
    qtRaw === "low" || qtRaw === "medium" || qtRaw === "high" ? qtRaw : undefined;
  return { requiresReview, autonomyEnabled, qualityThreshold, raw: parsed, source };
}

/**
 * Resolve the effective policy for an agent (optionally per-client). Most-specific match
 * wins; no match fails SAFE to { requiresReview: true }. Never throws.
 */
export async function resolveAgentPolicy(
  tenantId: string,
  agentId: string,
  clientId: string | null = null,
): Promise<ResolvedPolicy> {
  // 0. KILL SWITCH (§2.4) — the tenant's non-overridable layer, ABOVE all policy. The first
  // reader of tenant_autonomy_settings (single-row lookup on tas_tenant_unique). If the row
  // exists AND kill_switch is true, autonomy is globally OFF for this tenant: return gated
  // immediately, for ANY agent, winning over every policy row below. A MISSING row means
  // only "no kill switch set" — it does NOT enable autonomy and does NOT bypass anything; we
  // fall through to the normal fail-safe-gated ladder. One extra independent query by design
  // (the singleton db, no tx — uncached, like the rest of this resolver).
  const ks = await db
    .select({ killSwitch: tenantAutonomySettings.killSwitch })
    .from(tenantAutonomySettings)
    .where(eq(tenantAutonomySettings.tenantId, tenantId))
    .limit(1);
  if (ks[0]?.killSwitch) {
    return { requiresReview: true, autonomyEnabled: false, raw: null, source: "kill_switch" };
  }

  // 1. per-client-per-agent
  if (clientId) {
    const r = await db
      .select({ policy: agentPolicies.policy })
      .from(agentPolicies)
      .where(
        and(
          eq(agentPolicies.tenantId, tenantId),
          eq(agentPolicies.clientId, clientId),
          eq(agentPolicies.agentId, agentId),
          eq(agentPolicies.status, "active"),
        ),
      )
      .limit(1);
    if (r[0]) return toResolved(r[0].policy, "tenant_client");
  }

  // 2. per-tenant-per-agent (client_id IS NULL)
  const r2 = await db
    .select({ policy: agentPolicies.policy })
    .from(agentPolicies)
    .where(
      and(
        eq(agentPolicies.tenantId, tenantId),
        isNull(agentPolicies.clientId),
        eq(agentPolicies.agentId, agentId),
        eq(agentPolicies.status, "active"),
      ),
    )
    .limit(1);
  if (r2[0]) return toResolved(r2[0].policy, "tenant");

  // 3. platform default
  const r3 = await db
    .select({ policy: agentPolicyDefaults.policy })
    .from(agentPolicyDefaults)
    .where(and(eq(agentPolicyDefaults.agentId, agentId), eq(agentPolicyDefaults.status, "active")))
    .limit(1);
  if (r3[0]) return toResolved(r3[0].policy, "default");

  // 4. fail-safe
  return { requiresReview: true, autonomyEnabled: false, raw: null, source: "fallback" };
}

/**
 * Activate a tenant agent_policy row, enforcing single-active ATOMICALLY (R-7.x / decision
 * B / F3). Same shape as activatePromptTemplate; the key includes the NULLABLE client_id, so
 * the demote match is NULL-aware (isNull when clientId is null, eq otherwise — the same
 * nullable-client_id reason there is no DB unique on this table, decision B).
 *
 * Throws: SingleActiveInvariantViolated, ActivationTargetMismatch.
 */
export async function activateAgentPolicy(input: {
  tenantId: string;
  agentId: string;
  clientId: string | null;
  id: string;
}): Promise<void> {
  const clientMatch = input.clientId === null ? isNull(agentPolicies.clientId) : eq(agentPolicies.clientId, input.clientId);
  const key = `(tenant=${input.tenantId}, client=${input.clientId ?? "NULL"}, agent=${input.agentId})`;
  await db.transaction(async (tx) => {
    const demote = await tx
      .update(agentPolicies)
      .set({ status: "archived" })
      .where(
        and(
          eq(agentPolicies.tenantId, input.tenantId),
          clientMatch,
          eq(agentPolicies.agentId, input.agentId),
          eq(agentPolicies.status, "active"),
        ),
      );
    // affectedRows is driver-mode invariant here: the WHERE filter (status='active') excludes
    // the new value (status='archived'), so any row matching the WHERE necessarily changes.
    // Counts are therefore identical under default mysql2 and under CLIENT_FOUND_ROWS.
    // Switching to count-then-update would introduce a within-transaction race window
    // (count, then-update) that this shape doesn't have.
    const demoted = demote.rowCount ?? 0;
    if (demoted > 1) throw new SingleActiveInvariantViolated("agent_policies", key, demoted);

    const promote = await tx
      .update(agentPolicies)
      .set({ status: "active" })
      .where(
        and(
          eq(agentPolicies.id, input.id),
          eq(agentPolicies.tenantId, input.tenantId),
          clientMatch,
          eq(agentPolicies.agentId, input.agentId),
        ),
      );
    if (promote.rowCount !== 1) throw new ActivationTargetMismatch("agent_policies", input.id);
  });
}
