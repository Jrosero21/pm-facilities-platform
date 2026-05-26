// ── Phase 7 batch 7c — scope-generator publish-path named errors ──────────────────────
// Named (not generic Error), matching the A1 pattern applied to the F3 self-check, so the
// publish-path failure modes are testable to the same precision — the verify script asserts
// against the specific type, not "any throw."

/** publishScopeDraft guard + in-txn re-check: the draft is not in 'approved' status. */
export class DraftNotApproved extends Error {
  constructor(draftId: string) {
    super(`DRAFT_NOT_APPROVED: scope draft ${draftId} is not in 'approved' status`);
    this.name = "DraftNotApproved";
  }
}
