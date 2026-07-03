import "server-only";

import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import { emailWorkOrderDrafts, inboundEmails } from "@/server/schema";

// ── intake_parser_v1 data layer ───────────────────────────────────────────────────────
// The parser reads a STORED inbound_emails row (its body IS the blob) and writes ONE
// email_work_order_drafts row @ pending_review (RECORD-DON'T-APPLY — never a job). It reuses
// the EXISTING draft table (Phase 13g); no new table. resolved_* are all nullable, so a
// partial draft (unresolved client/trade/priority left NULL) is the normal, valid outcome.

export type InboundEmailBlob = {
  id: string;
  tenantId: string;
  subject: string | null;
  bodyText: string | null;
  ingestionAccountId: string | null;
};

/** Read a stored inbound email (tenant-scoped) — the blob the parser extracts from. */
export async function getInboundEmailBlob(tenantId: string, inboundEmailId: string): Promise<InboundEmailBlob | null> {
  const rows = await db
    .select({
      id: inboundEmails.id,
      tenantId: inboundEmails.tenantId,
      subject: inboundEmails.subject,
      bodyText: inboundEmails.bodyText,
      ingestionAccountId: inboundEmails.ingestionAccountId,
    })
    .from(inboundEmails)
    .where(and(eq(inboundEmails.tenantId, tenantId), eq(inboundEmails.id, inboundEmailId)))
    .limit(1);
  return rows[0] ?? null;
}

export type IntakeDraft = typeof emailWorkOrderDrafts.$inferSelect;

/**
 * Single-writer — insert the parser's draft @ pending_review. resolved_* are NULL unless the
 * caller resolved them via the existing mappers. NEVER creates a job (that is the human-gated
 * approveEmailDraft path). Mirrors createScopeDraft's single-row insert + reload.
 */
export async function createIntakeDraft(input: {
  tenantId: string;
  inboundEmailId: string;
  sourceType: "email_ingestion" | "forwarded_email";
  problemDescription: string | null;
  resolvedClientId: string | null;
  resolvedTradeId: string | null;
  resolvedPriorityId: string | null;
}): Promise<IntakeDraft> {
  const id = uuidv7();
  await db.insert(emailWorkOrderDrafts).values({
    id,
    tenantId: input.tenantId,
    inboundEmailId: input.inboundEmailId,
    parseResultId: null, // the AI parser produces no email_parse_results row (that is the deterministic reader's)
    draftStatus: "pending_review",
    sourceType: input.sourceType,
    problemDescription: input.problemDescription,
    resolvedClientId: input.resolvedClientId,
    resolvedClientLocationId: null, // parser never resolves/creates a location — free-text location stays for review
    resolvedTradeId: input.resolvedTradeId,
    resolvedPriorityId: input.resolvedPriorityId,
  });
  const row = (await db.select().from(emailWorkOrderDrafts).where(eq(emailWorkOrderDrafts.id, id)).limit(1))[0];
  if (!row) throw new Error("Intake draft insert succeeded but row could not be reloaded.");
  return row;
}
