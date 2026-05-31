import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { db } from "@/server/db";
import {
  inboundEmails,
  emailIngestionAccounts,
  emailParseResults,
  emailWorkOrderDrafts,
  externalClientMappings,
} from "@/server/schema";
import { getReader } from "@/lib/integrations/email";
import type { EmailReaderInput, EmailSourceType } from "@/lib/integrations/email";
import { getSystemUserId } from "@/server/integrations/system-user";
import { createLocation } from "@/server/client-locations";
import { resolveTrade, resolvePriority } from "@/lib/integrations/core/mapping";
import { writeAuditLog } from "@/server/audit";

// ── Phase 13 batch 13g — EMAIL INGEST ENGINE (stored inbound_email → parse → draft) ───
// Turns a STORED inbound_emails row into an email_parse_results row + an
// email_work_order_drafts row @ pending_review, with full status/audit logging. Mirrors
// the Phase-12 core/ingest.ts ordering (client park IF-7 / location auto-stub SF-2 / codes
// flag IF-1) but lands a DRAFT, never a job — RECORD-DON'T-APPLY. The draft→job step is the
// SEPARATE approval wrapper (13h, D-5); CF-13.1's auto-create branch will reuse that path.
//
// SCOPE DISCIPLINE (mirrors ingest-external-job.ts): tenantId is derived from the loaded
// inbound_emails row — NEVER from parsed content. createdByUserId is the SF-1 system user.
//
// LOGGING (D-3): email logs via email_parse_results rows + inbound_emails.processing_status
// transitions + writeAuditLog (actorLabel='system:email-ingest' for system attribution) —
// NOT the external_sync_* helpers (those are the external-portal family's tables).
//
// DEDUP (OQ-13.4, flag-don't-reject): a repeat (tenant_id, message_id) is STORED and flagged
// (processing_status='duplicate_flagged') for operator adjudication — never hard-rejected
// nor silently allowed. The (tenant_id, message_id) index is the lookup; it is NON-unique.
//
// READERS: the deterministic reader runs on the auto path; parse() NEVER throws (contract) —
// an unreadable email yields a failed/0 draft routed to review. AI-assist is operator-invoked
// INSIDE review (13i, §2.5), never auto-run here. Both are stubs this phase (CF-13.3), so in
// practice every email currently drafts at pending_review with nothing resolved (the operator
// resolves client/location/codes by hand until real readers + mappings land).

const SYSTEM_ACTOR = "system:email-ingest";
const DIR_INBOUND = ["inbound", "both"] as const;

export type IngestEmailResult =
  | { outcome: "drafted"; draftId: string; parseResultId: string; flags: string[] }
  | { outcome: "duplicate_flagged"; inboundEmailId: string; existingMessageId: string }
  | { outcome: "parked_unmapped_client"; draftId: string; parseResultId: string }
  | { outcome: "failed"; parseResultId?: string; error: string };

/** The JSON-at-read helper (the agents/drafts.ts:109 precedent) — MariaDB json() returns a
 *  raw string; parse at the boundary before handing rawHeaders to the reader. */
function parseJsonColumn(v: unknown): unknown {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v ?? null;
}

export async function ingestEmail({
  inboundEmailId,
}: {
  inboundEmailId: string;
}): Promise<IngestEmailResult> {
  // ── 1. Load the inbound row; scope (tenantId) comes from IT, never parsed content. ──
  const row = (
    await db
      .select()
      .from(inboundEmails)
      .where(eq(inboundEmails.id, inboundEmailId))
      .limit(1)
  )[0];
  if (!row) {
    return { outcome: "failed", error: "INBOUND_EMAIL_NOT_FOUND" };
  }
  const tenantId = row.tenantId;

  try {
    // ── 2. System attribution (SF-1). ──
    const systemUserId = await getSystemUserId();

    // ── 3. DEDUP (flag-don't-reject, OQ-13.4): same (tenant_id, message_id), different id. ──
    if (row.messageId) {
      const dup = (
        await db
          .select({ id: inboundEmails.id })
          .from(inboundEmails)
          .where(
            and(
              eq(inboundEmails.tenantId, tenantId),
              eq(inboundEmails.messageId, row.messageId),
              ne(inboundEmails.id, inboundEmailId),
            ),
          )
          .limit(1)
      )[0];
      if (dup) {
        await db
          .update(inboundEmails)
          .set({ processingStatus: "duplicate_flagged" })
          .where(eq(inboundEmails.id, inboundEmailId));
        await writeAuditLog({
          tenantId,
          actorLabel: SYSTEM_ACTOR,
          action: "email.duplicate_flagged",
          targetType: "inbound_email",
          targetId: inboundEmailId,
          metadata: { messageId: row.messageId },
        });
        return {
          outcome: "duplicate_flagged",
          inboundEmailId,
          existingMessageId: row.messageId,
        };
      }
    }

    // ── 4. Load the ingestion account (for sourceType — D-6 — and the future
    //       external_system_id resolution key, CF-13.5). Only existing columns are read. ──
    const account = row.ingestionAccountId
      ? (
          await db
            .select({
              id: emailIngestionAccounts.id,
              sourceType: emailIngestionAccounts.sourceType,
            })
            .from(emailIngestionAccounts)
            .where(eq(emailIngestionAccounts.id, row.ingestionAccountId))
            .limit(1)
        )[0]
      : undefined;
    const sourceType: EmailSourceType = account?.sourceType ?? "email_ingestion";

    // ── 5. PARSE (parse() never throws; deterministic reader on the auto path). ──
    const input: EmailReaderInput = {
      subject: row.subject ?? undefined,
      bodyText: row.bodyText ?? undefined,
      bodyHtml: row.bodyHtml ?? undefined,
      fromAddress: row.fromAddress ?? undefined,
      rawHeaders:
        (parseJsonColumn(row.rawHeaders) as Record<string, unknown> | null) ??
        undefined,
      sourceType,
      raw: row,
    };
    const draft = getReader("deterministic").parse(input);

    // ── 6. RESOLVE — forward-compatible, guarded (Path 2 / CF-13.5). ──
    const flags: string[] = [];

    // CF-13.5: email_ingestion_accounts has NO external_system_id column yet (Path 2
    // deferred). Resolution is written forward-compatibly but is DORMANT today: with stub
    // readers there is no extractedClientCode, and there is no system id to key the frozen
    // external_client_mappings resolver, so this always takes the ELSE (client_unresolved_stub
    // → park). When the column + real readers land, set accountExternalSystemId =
    // account.externalSystemId here and the block below resolves the code via the frozen table.
    const accountExternalSystemId: string | null = null; // ← becomes account.externalSystemId (CF-13.5)

    let resolvedClientId: string | null = null;
    if (draft.extractedClientCode && accountExternalSystemId) {
      const clientRows = await db
        .select({ clientId: externalClientMappings.clientId })
        .from(externalClientMappings)
        .where(
          and(
            eq(externalClientMappings.externalSystemId, accountExternalSystemId),
            eq(externalClientMappings.externalCode, draft.extractedClientCode),
            inArray(externalClientMappings.direction, [...DIR_INBOUND]),
          ),
        )
        .limit(1);
      if (clientRows[0]) {
        resolvedClientId = clientRows[0].clientId;
      } else {
        flags.push("client_unmapped"); // extractable but no mapping → park (IF-7)
      }
    } else {
      flags.push("client_unresolved_stub"); // the stub reality: nothing to resolve → review
    }

    // ── 7. LOCATION (SF-2, guarded; dormant with stubs since resolvedClientId is null). ──
    // NOTE (CF-13.5 activation): createLocation uses the global db (not a tx); when this path
    // goes live alongside a transactional draft write, prefer a tx-aware location create.
    let resolvedClientLocationId: string | null = null;
    if (resolvedClientId && draft.locationDetail) {
      const NR = "[NEEDS REVIEW]";
      const d = draft.locationDetail;
      const created = await createLocation({
        tenantId,
        clientId: resolvedClientId,
        createdByUserId: systemUserId,
        name: d.locationName?.trim() || NR,
        addressLine1: d.addressLine1?.trim() || NR,
        city: d.city?.trim() || NR,
        stateProvince: d.stateProvince?.trim() || NR,
        postalCode: d.postalCode?.trim() || NR,
        country: d.country,
      });
      resolvedClientLocationId = created.id;
      flags.push("auto_created_location", "location_needs_review");
    }

    // ── 8. CODES (IF-1, guarded; dormant with stubs). trade global, priority tenant-scoped. ──
    let resolvedTradeId: string | null = null;
    let resolvedPriorityId: string | null = null;
    if (accountExternalSystemId) {
      if (draft.extractedTradeCode) {
        const t = await resolveTrade({
          externalSystemId: accountExternalSystemId,
          externalCode: draft.extractedTradeCode,
          direction: "inbound",
        });
        if (t.matched) resolvedTradeId = t.internalId;
        else flags.push("unmapped_trade");
      }
      if (draft.extractedPriorityCode) {
        const p = await resolvePriority({
          tenantId,
          externalSystemId: accountExternalSystemId,
          externalCode: draft.extractedPriorityCode,
          direction: "inbound",
        });
        if (p.matched) resolvedPriorityId = p.internalId;
        else flags.push("unmapped_priority");
      }
    }

    // ── 9–11. Write parse_result + draft + status transition in ONE transaction. ──
    const parseResultId = uuidv7();
    const draftId = uuidv7();
    await db.transaction(async (tx) => {
      // 9. email_parse_results — the structured parser output. extractedFields is a json
      //    column: pass the OBJECT (drizzle stringifies) — the logPayload precedent; passing
      //    JSON.stringify(...) would double-encode. confidence is decimal → string on insert.
      await tx.insert(emailParseResults).values({
        id: parseResultId,
        tenantId,
        inboundEmailId,
        parserKind: draft.parserKind,
        matchedFormat: draft.matchedFormat ?? null,
        matchedRuleId: null, // no rule registered yet (CF-13.3)
        confidence: draft.confidence.toString(),
        extractedFields: {
          parserKind: draft.parserKind,
          parseOutcome: draft.parseOutcome,
          confidence: draft.confidence,
          matchedFormat: draft.matchedFormat ?? null,
          extractedClientCode: draft.extractedClientCode ?? null,
          extractedLocationCode: draft.extractedLocationCode ?? null,
          extractedStatusCode: draft.extractedStatusCode ?? null,
          extractedTradeCode: draft.extractedTradeCode ?? null,
          extractedPriorityCode: draft.extractedPriorityCode ?? null,
          locationDetail: draft.locationDetail ?? null,
          problemDescription: draft.problemDescription ?? null,
        } as object,
        extractedClientCode: draft.extractedClientCode ?? null,
        parseOutcome: draft.parseOutcome,
      });

      // 10. email_work_order_drafts @ pending_review — RECORD-DON'T-APPLY (no job here).
      await tx.insert(emailWorkOrderDrafts).values({
        id: draftId,
        tenantId,
        inboundEmailId,
        parseResultId,
        draftStatus: "pending_review",
        sourceType: draft.sourceType,
        problemDescription: draft.problemDescription ?? null,
        resolvedClientId,
        resolvedClientLocationId,
        resolvedTradeId,
        resolvedPriorityId,
        createdJobId: null,
        reviewedByUserId: null,
        reviewedAt: null,
      });

      // 11. Transition the inbound row → 'drafted' (a draft row now exists).
      await tx
        .update(inboundEmails)
        .set({ processingStatus: "drafted" })
        .where(eq(inboundEmails.id, inboundEmailId));
    });

    // ── 12. Audit + return. parked vs drafted distinguished by the flags. ──
    await writeAuditLog({
      tenantId,
      actorLabel: SYSTEM_ACTOR,
      action: "email.drafted",
      targetType: "email_work_order_draft",
      targetId: draftId,
      metadata: {
        parseResultId,
        parseOutcome: draft.parseOutcome,
        confidence: draft.confidence,
        flags,
      },
    });

    if (flags.includes("client_unmapped")) {
      return { outcome: "parked_unmapped_client", draftId, parseResultId };
    }
    return { outcome: "drafted", draftId, parseResultId, flags };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort: mark the inbound row failed + audit, then return failed (mirrors the
    // ingest.ts catch/finalize discipline — the txn rolled back any partial draft writes).
    await db
      .update(inboundEmails)
      .set({ processingStatus: "failed" })
      .where(eq(inboundEmails.id, inboundEmailId))
      .catch(() => {});
    await writeAuditLog({
      tenantId,
      actorLabel: SYSTEM_ACTOR,
      action: "email.ingest_failed",
      targetType: "inbound_email",
      targetId: inboundEmailId,
      metadata: { error: message.slice(0, 2000) },
    });
    return { outcome: "failed", error: message.slice(0, 2000) };
  }
}
