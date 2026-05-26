// ── Phase 7 batch 7c — agent-config named errors ─────────────────────────────────────
// Typed errors for the config resolvers + the F3 single-active write-path invariant. Named
// (not generic Error) so the verify script can assert the SPECIFIC failure fired (A1) — a
// generic catch would pass on a connection drop or a downstream syntax error and silently
// fail to verify the self-check actually triggered.

/** resolveActivePrompt fail-closed: no active prompt resolved for the key (Surface #2). */
export class NoActivePromptError extends Error {
  constructor(agentId: string, variant: string) {
    super(`NO_ACTIVE_PROMPT: no active prompt for agent_id=${agentId} variant=${variant}`);
    this.name = "NoActivePromptError";
  }
}

/**
 * F3 self-check (demote step): more than one row was active for the resolver key BEFORE
 * this activation — i.e. the single-active invariant was already violated (pre-existing
 * corruption). The demote runs with NO LIMIT precisely so this surfaces (a LIMIT would
 * silently demote one of several stray actives and continue). Aborts the txn. (R-7.x.)
 */
export class SingleActiveInvariantViolated extends Error {
  constructor(table: string, key: string, foundActive: number) {
    super(`SINGLE_ACTIVE_INVARIANT_VIOLATED: ${table} had ${foundActive} active rows for ${key} before activation (expected <= 1)`);
    this.name = "SingleActiveInvariantViolated";
  }
}

/**
 * F3 self-check (promote step): the target row to activate does not exist or does not match
 * the resolver key (promote affected != 1). (R-7.x.)
 */
export class ActivationTargetMismatch extends Error {
  constructor(table: string, id: string) {
    super(`ACTIVATION_TARGET_MISMATCH: ${table} row id=${id} missing or key mismatch (promote affected != 1)`);
    this.name = "ActivationTargetMismatch";
  }
}
