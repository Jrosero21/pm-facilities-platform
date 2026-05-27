// ── Phase 8 batch 8c — billing data-layer error module ───────────────────────────────
// MIXED module (as of 8c.5): re-exports the generic single-active F3 errors (still serving the
// NTE substrate, 8c.1) PLUS billing-domain F3 classes defined here. Billing code imports all of
// its errors from this one surface (not by reaching into agents/config).
//
// 8b's named "NteRuleAlreadyActive" IS SingleActiveInvariantViolated applied to client_nte_rules
// — no distinct class (8c-D1).
export {
  ActivationTargetMismatch,
  SingleActiveInvariantViolated,
} from "@/server/agents/config/errors";

// ── Proposal state-machine F3 errors (8c.5) ──────────────────────────────────────────
// Real billing-domain errors (state guards), NOT programmer errors — reachable via tests that
// assert by class, so the class names + constructor signatures are stable. Mirror the
// agents/config/errors.ts pattern (extends Error + explicit this.name). Carry the proposal id +
// the offending status (or live count) for debuggability.

/** A draft-only operation (edit / line CRUD / send) hit a non-draft proposal. */
export class ProposalNotDraft extends Error {
  constructor(id: string, status: string) {
    super(`Proposal ${id} is not draft (status=${status})`);
    this.name = "ProposalNotDraft";
  }
}

/** recordProposalAcceptance hit a proposal that is not in `sent`. */
export class ProposalNotSent extends Error {
  constructor(id: string, status: string) {
    super(`Proposal ${id} is not sent (status=${status})`);
    this.name = "ProposalNotSent";
  }
}

/** withdrawProposal hit a terminal proposal (declined/expired/superseded/withdrawn). */
export class ProposalNotWithdrawable extends Error {
  constructor(id: string, status: string) {
    super(`Proposal ${id} is not withdrawable (terminal status=${status})`);
    this.name = "ProposalNotWithdrawable";
  }
}

/** createProposalRevision found a live revision in the chain that is not the one being
 *  superseded (single-live-revision invariant, R-7.1-style, data-layer-enforced). */
export class ProposalChainHasLiveRevision extends Error {
  constructor(rootId: string, liveCount: number) {
    super(`Proposal chain ${rootId} has ${liveCount} live revision(s); cannot create another (expected the one being superseded or none)`);
    this.name = "ProposalChainHasLiveRevision";
  }
}
