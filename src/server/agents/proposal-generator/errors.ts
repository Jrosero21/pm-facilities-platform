// ── Phase 27 batch 3b — proposal-generator named errors ───────────────────────────────
// Named (not generic Error), mirroring invoice-creator/errors.ts, so the publish-path failure
// modes are testable to the same precision. DRAFT_NOT_FOUND / DRAFT_NOT_PENDING_REVIEW stay
// plain Error strings (thrown by reviews.ts) — only the publish-gate states get a class.

/** publishProposalDraft guard + in-txn re-check: the draft is not in 'approved' status. */
export class DraftNotApproved extends Error {
  constructor(draftId: string) {
    super(`DRAFT_NOT_APPROVED: proposal draft ${draftId} is not in 'approved' status`);
    this.name = "DraftNotApproved";
  }
}

/**
 * publishProposalDraft idempotency guard (§2.6): the draft already has a materialized proposal
 * (published_proposal_id set), so a second publish would create a DUPLICATE proposal. Enforced
 * at the write boundary — both the pre-flight read (step b) AND the finalize-txn re-check under
 * the draft lock (step j), so a concurrent publish that wins the lock surfaces this on the loser.
 * Mirrors InvoiceAlreadyMaterialized.
 */
export class ProposalAlreadyMaterialized extends Error {
  constructor(draftId: string) {
    super(`PROPOSAL_ALREADY_MATERIALIZED: proposal draft ${draftId} already has a published proposal`);
    this.name = "ProposalAlreadyMaterialized";
  }
}

/**
 * publishProposalDraft pricing guard (proposal-specific — NO invoice analog): the approved
 * content carries a line with no / malformed pricing. Unlike the invoice draft (whose numbers
 * are vendor-joined before review), the proposal draft is NUMBER-FREE; pricing appears ONLY via
 * the operator's edited_content (edits.ts). An approve-AS-IS (no edit) draft therefore has no
 * dollars and cannot be billed — this fails the publish closed rather than billing a $0 line.
 */
export class ProposalRequiresPricing extends Error {
  constructor(draftId: string) {
    super(`PROPOSAL_REQUIRES_PRICING: proposal draft ${draftId} has unpriced/ malformed line(s); operator must price it at the gate`);
    this.name = "ProposalRequiresPricing";
  }
}
