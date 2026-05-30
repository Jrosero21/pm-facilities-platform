import "server-only";

import { getProposal, recordProposalAcceptance } from "@/server/billing/proposals";
import { getClientJobDetail } from "@/server/client/get-client-job-detail";

/**
 * Client accepts a proposal on one of their own jobs — Phase 11 batch 11i.
 *
 * The security crux: recordProposalAcceptance (Phase 8) TRUSTS its caller for
 * authorization (no role/scope check). So this wrapper is the SOLE authz gate.
 *
 * Scope guard (J2): fetch the proposal, then verify its job's client ∈ clientScope
 * via getClientJobDetail. A forged/out-of-scope proposalId throws CLIENT_SCOPE_MISMATCH
 * BEFORE recordProposalAcceptance runs → zero state change (and recordProposalAcceptance
 * is itself txn-wrapped). We throw the same CLIENT_SCOPE_MISMATCH for a missing proposal
 * so existence isn't leaked across clients.
 *
 * Accept-only (J3) — no client-side reject (the operator revises per 11b Fork 6).
 * recordProposalAcceptance is called UNCHANGED; it enforces status='sent' (throws
 * ProposalNotSent otherwise — mapped to friendly copy at the action layer).
 */
export async function acceptClientProposal(input: {
  tenantId: string;
  proposalId: string;
  clientScope: Set<string>;
  actorUserId: string;
}): Promise<void> {
  const p = await getProposal(input.tenantId, input.proposalId);
  if (!p) throw new Error("CLIENT_SCOPE_MISMATCH");

  const detail = await getClientJobDetail(
    input.tenantId,
    p.jobId,
    input.clientScope,
  );
  if (!detail) throw new Error("CLIENT_SCOPE_MISMATCH");

  await recordProposalAcceptance({
    tenantId: input.tenantId,
    id: input.proposalId,
    decision: "accepted",
    approverUserId: input.actorUserId,
    decidedAt: new Date(),
  });
}
