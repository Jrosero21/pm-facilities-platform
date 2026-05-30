"use client";

import { useActionState } from "react";
import {
  acceptProposalAction,
  type ProposalAcceptResult,
} from "@/app/(client)/client/jobs/[id]/actions";

/**
 * Per-proposal Accept button — Phase 11 batch 11i.
 *
 * Accept-only (J3 — no reject; the operator revises). Both jobId and proposalId
 * are bound into the action (jobId threads the revalidate target). Mirrors the
 * client house useActionState idiom.
 */
export function ProposalAccept({
  jobId,
  proposalId,
}: {
  jobId: string;
  proposalId: string;
}) {
  const [state, formAction, pending] = useActionState<
    ProposalAcceptResult | null,
    FormData
  >(acceptProposalAction.bind(null, jobId, proposalId), null);

  return (
    <form action={formAction} className="mt-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Accepting…" : "Accept proposal"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
