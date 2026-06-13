import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, proposalDrafts, proposals } from "@/server/schema";
import { createProposal, addProposalLineItem } from "@/server/billing/proposals";
import { resolveClientMarkupDefault } from "@/server/billing/client-invoices";
import { resolveAgreedRateLineMarkups } from "@/server/billing/client-rates";
import { emitJobBillingEvent } from "@/server/billing/events";
import { getEffectiveNte } from "@/server/billing/change-orders";
import { computeArLines, type ArLineInput } from "@/server/billing/totals";
import { decideProposalKind } from "@/server/billing/proposal-routing";
import { isDecimalStr } from "@/server/billing/money";
import { getJobDetail } from "@/server/jobs";
import { getProposalDraft, type ProposedProposal } from "./drafts";
import { getApproveReviewForProposalDraft } from "./reviews";
import { DraftNotApproved, ProposalAlreadyMaterialized, ProposalRequiresPricing } from "./errors";

// ── Phase 27 batch 3b — publishProposalDraft ──────────────────────────────────────────
// The human-gated path that MATERIALIZES an APPROVED proposal draft into a canonical `proposals`
// row + proposal_line_items. The agent can never reach this (§2.9 / R-6.15).
//
// THE NTE SEND-GATE (D2) — the load-bearing decision: the proposal TOTAL (computed with the SHARED
// computeArLines primitive over the approved content + the rule-resolved markup) is compared to the
// job's EFFECTIVE NTE (getEffectiveNte = base snapshot + Σ approved change orders). Under-or-equal
// → kind='internal' (terminal, auto-billed); over (or no NTE, or forced) → kind='client' (the
// existing client-facing review flow). forceClientReview only ever forces TOWARD review (§2.1-safe).
//
// MONEY DISCIPLINE:
//  - Every dollar comes from the APPROVED CONTENT (the approve review's edited_content — the gold
//    signal, D4 — else the draft's proposed_proposal, which is NUMBER-FREE and therefore fails the
//    pricing guard). The LLM never supplied a number (D1).
//  - markup is RE-RESOLVED FRESH at publish (D2): resolveClientMarkupDefault once; the same string
//    feeds BOTH the gate total and every addProposalLineItem, so the gate basis is byte-identical
//    to what recalculateProposalTotals later persists.
//
// ATOMICITY (§2.6 — deliberate NON-atomic sequence, mirrors publishInvoiceDraft → CF-27.3): guard →
// createProposal → N×addProposalLineItem → finalize txn. The `proposals` row is created (h) and its
// lines added (i) BEFORE the draft is flipped to published (j). If the process dies in the h–i
// window, the draft's published_proposal_id is still NULL, so a retry re-materializes and leaves the
// FIRST proposal ORPHANED (a never-finalized draft proposal, safely operator-deletable). Documented
// known limitation (CF-27.3), NOT a blocker. The finalize txn's lock+recheck is the single authority
// for "this draft published exactly once."

export type PublishProposalResult = { proposalId: string; kind: "client" | "internal" };

/**
 * Materialize an APPROVED proposal draft into a `proposals` row (+ line items), deciding kind via
 * the NTE send-gate. Throws DRAFT_NOT_FOUND, DraftNotApproved, ProposalAlreadyMaterialized,
 * ProposalRequiresPricing, JOB_NOT_FOUND.
 */
export async function publishProposalDraft(input: {
  tenantId: string;
  jobId: string;
  draftId: string;
  actorUserId: string;
  forceClientReview?: boolean;
}): Promise<PublishProposalResult> {
  // a. load the draft (read-only, before any write). Wrong tenant/job → not found.
  const draft = await getProposalDraft(input.tenantId, input.draftId);
  if (!draft || draft.jobId !== input.jobId) throw new Error("DRAFT_NOT_FOUND");

  // b. idempotency guard (pre-flight): already materialized → refuse double-materialize.
  if (draft.publishedProposalId != null) throw new ProposalAlreadyMaterialized(input.draftId);

  // c. status guard: only an approved draft materializes.
  if (draft.status !== "approved") throw new DraftNotApproved(input.draftId);

  // d. resolve the APPROVED CONTENT — edited_content wins (operator pricing, D4); else the
  //    immutable proposed_proposal (NUMBER-FREE → fails the pricing guard in g).
  const approved = await getApproveReviewForProposalDraft(input.tenantId, input.draftId);
  const content: ProposedProposal = approved?.editedContent ?? draft.proposedProposal;

  // e. job → clientId + the effective NTE (the send-gate basis; string | null, decimal string).
  const job = await getJobDetail(input.tenantId, input.jobId);
  if (!job) throw new Error("JOB_NOT_FOUND");
  const clientId = job.clientId;
  const effectiveNte = await getEffectiveNte(input.tenantId, input.jobId);

  // f. resolve markup ONCE (D2) — the rule default feeds non-agreed-rate lines at the gate AND at i.
  const markupResolved = await resolveClientMarkupDefault(input.tenantId, clientId);

  // f2. Phase (ii) Unit 2a — per-line BILLED markup: null (no markup) for a CONFIRMED agreed-rate
  //     labor/trip line (the editor kept the pre-filled rate; re-resolved server-side, never trusting
  //     the tag), else markupResolved. The SAME array feeds the gate total (g) AND every
  //     addProposalLineItem (i), so the NTE-gate basis stays byte-identical to what
  //     recalculateProposalTotals persists — an agreed-rate line is unmarked-up on both sides. SHARED
  //     with the routing preview.
  const lineMarkups = await resolveAgreedRateLineMarkups({
    tenantId: input.tenantId,
    jobId: input.jobId,
    ruleMarkupPercent: markupResolved,
    lines: content.lineItems.map((ln) => ({
      category: ln.category,
      unitPrice: ln.unitPrice ?? "",
      tradeId: ln.tradeId,
      rateType: ln.rateType,
    })),
  });

  // g. PRICING GUARD + total. Every content line must be priced (well-formed decimal qty/unit
  //    price) — covers the approve-as-is (number-free) path. Then compute the proposal TOTAL with
  //    the SHARED computeArLines primitive (Big.js, decimal-string — NO float).
  const arLines: ArLineInput[] = content.lineItems.map((ln, i) => {
    if (typeof ln.quantity !== "string" || !isDecimalStr(ln.quantity, 8, 2)) {
      throw new ProposalRequiresPricing(input.draftId);
    }
    if (typeof ln.unitPrice !== "string" || !isDecimalStr(ln.unitPrice, 10, 2)) {
      throw new ProposalRequiresPricing(input.draftId);
    }
    return {
      id: String(i),
      quantity: ln.quantity,
      unitPrice: ln.unitPrice,
      markupPercent: lineMarkups[i], // null for an agreed-rate line, else the rule default — same at i.
      taxAmount: ln.taxAmount ?? "0",
    };
  });
  if (arLines.length === 0) throw new ProposalRequiresPricing(input.draftId);
  const total = computeArLines(arLines).total;

  // Assemble the proposal's own scope_snapshot (D4 / bridge to CF-26.1 — the operations-authored
  // scope source). One structured block per line from the operator-reviewed scopePhrasing; the
  // line `description` is kept as-is on the line item. We only POPULATE the field here — the
  // CF-26.1 consumer is a later concern.
  const scopeSnapshot = content.lineItems
    .map((ln, i) => `${i + 1}. [${ln.category}] ${ln.description}\n${ln.scopePhrasing ?? ""}`.trimEnd())
    .join("\n\n");

  // NTE GATE — the kind decision (shared with the routing preview so they can never disagree).
  const kind = decideProposalKind(total, effectiveNte, input.forceClientReview === true);

  // h. create the canonical proposal at the decided kind (own txn; lands status='draft').
  const { id: proposalId } = await createProposal({
    tenantId: input.tenantId,
    jobId: input.jobId,
    kind,
    scopeSnapshot, // D4 — the operations-authored scope source (CF-26.1 bridge)
    createdByUserId: input.actorUserId, // the operator who published the draft
  });

  // i. add each line (own txn each; recalculateProposalTotals runs inside). Pass the per-line markup
  //    from f2 plus the line's kept tradeId/rateType — addProposalLineItem is the single authority on
  //    provenance: it RE-CONFIRMS the explicit price still equals the agreed rate, then PERSISTS
  //    trade_id/rate_type and forces markup null for a confirmed agreed-rate line (margin baked in),
  //    else keeps the rule markup with no provenance. f2's null markup and that forced-null are the
  //    same in the math, so the persisted total matches the gate basis either way.
  for (let i = 0; i < content.lineItems.length; i++) {
    const line = content.lineItems[i];
    await addProposalLineItem({
      tenantId: input.tenantId,
      proposalId,
      category: line.category,
      description: line.description,
      quantity: line.quantity as string, // pricing guard above proved these are well-formed strings
      unitPrice: line.unitPrice as string,
      unit: line.unit ?? undefined,
      markupPercent: lineMarkups[i],
      taxRate: line.taxRate ?? undefined,
      taxAmount: line.taxAmount ?? undefined,
      tradeId: line.tradeId ?? undefined,
      rateType: line.rateType ?? undefined,
    });
  }

  // j. finalize — the single authority for "published exactly once". Lock the draft, re-check it
  //    is still approved AND not-yet-materialized (a concurrent publish between b and j loses
  //    here); if internal, transition the new proposal → 'internal_billed' (client stays 'draft');
  //    stamp the provenance link + draft status; audit INSIDE the txn (R-6.7).
  await db.transaction(async (tx) => {
    const locked = await tx
      .select({ status: proposalDrafts.status, publishedProposalId: proposalDrafts.publishedProposalId })
      .from(proposalDrafts)
      .where(and(eq(proposalDrafts.tenantId, input.tenantId), eq(proposalDrafts.id, input.draftId)))
      .for("update");
    if (!locked[0]) throw new Error("DRAFT_NOT_FOUND");
    if (locked[0].status !== "approved") throw new DraftNotApproved(input.draftId);
    if (locked[0].publishedProposalId != null) throw new ProposalAlreadyMaterialized(input.draftId);

    if (kind === "internal") {
      // Net-new transition (no existing writer for internal_billed): direct status set under the
      // draft lock. The client path leaves the proposal at 'draft' (the existing review flow).
      await tx
        .update(proposals)
        .set({ status: "internal_billed" })
        .where(and(eq(proposals.tenantId, input.tenantId), eq(proposals.id, proposalId)));
      // D3 / §2.2 (autonomy-never-silent) + analytics-from-day-one: the internal-billed terminal is
      // a real operational moment with no downstream emitter. Emit inside the txn (atomic with the
      // transition) — mirrors createProposalRevision's proposal.superseded. proposal.* → proposalId.
      await emitJobBillingEvent(tx, {
        tenantId: input.tenantId,
        jobId: input.jobId,
        eventType: "proposal.internal_billed",
        actorUserId: input.actorUserId,
        summary: `Proposal auto-billed internally (≤ NTE) — ${total}`,
        amount: total,
        currency: "USD",
        proposalId,
        metadata: { effectiveNte, lineCount: content.lineItems.length },
      });
    }

    const res = await tx
      .update(proposalDrafts)
      .set({ status: "published", publishedProposalId: proposalId })
      .where(
        and(
          eq(proposalDrafts.tenantId, input.tenantId),
          eq(proposalDrafts.id, input.draftId),
          isNull(proposalDrafts.publishedProposalId), // belt-and-suspenders: only flip if still null
        ),
      );
    // The WHERE excludes the new value, so a matching row necessarily changed; 0 rows means a
    // concurrent publish already stamped it (the lock above should already have caught it).
    if (res[0].affectedRows !== 1) throw new ProposalAlreadyMaterialized(input.draftId);

    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "proposal_draft.published",
      targetType: "proposal_draft",
      targetId: input.draftId,
      metadata: {
        proposalId,
        kind,
        total,
        effectiveNte,
        lineCount: content.lineItems.length,
        usedEditedContent: approved?.editedContent != null,
      },
    });
  });

  return { proposalId, kind };
}
