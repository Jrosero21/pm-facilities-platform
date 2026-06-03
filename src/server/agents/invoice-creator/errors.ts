// ── Phase 26 batch 2b — invoice-creator named errors ──────────────────────────────────
// Named (not generic Error), matching the scope-generator precedent, so the publish-path
// failure modes are testable to the same precision. DRAFT_NOT_FOUND / DRAFT_NOT_PENDING_REVIEW
// stay plain Error strings (thrown by reviews.ts) — only the publish-gate states get a class.

/** publishInvoiceDraft guard + in-txn re-check: the draft is not in 'approved' status. */
export class DraftNotApproved extends Error {
  constructor(draftId: string) {
    super(`DRAFT_NOT_APPROVED: invoice draft ${draftId} is not in 'approved' status`);
    this.name = "DraftNotApproved";
  }
}

/**
 * publishInvoiceDraft idempotency guard (§2.6): the draft already has a materialized client
 * invoice (published_client_invoice_id set), so a second publish would create a DUPLICATE
 * client invoice. Enforced at the write boundary — both the pre-flight read (step b) AND the
 * finalize-txn re-check under the draft lock (step g), so a concurrent publish that wins the
 * lock surfaces this on the loser. Mirrors scope's ScopeAlreadyPublished.
 */
export class InvoiceAlreadyMaterialized extends Error {
  constructor(draftId: string) {
    super(`INVOICE_ALREADY_MATERIALIZED: invoice draft ${draftId} already has a published client invoice`);
    this.name = "InvoiceAlreadyMaterialized";
  }
}
