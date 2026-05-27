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

/**
 * publishScopeDraft gate (KL-7.g / DEC-B): the job already has a published scope, so a second
 * publish would append-duplicate `job_scope_steps`. One scope per job in Phase 7; re-scope is a
 * future workflow. Enforced at the write boundary (inside the publish txn, under the job lock)
 * so every writer inherits it — not just the UI action wrapper.
 */
export class ScopeAlreadyPublished extends Error {
  constructor(jobId: string) {
    super(`SCOPE_ALREADY_PUBLISHED: job ${jobId} already has a published scope`);
    this.name = "ScopeAlreadyPublished";
  }
}
