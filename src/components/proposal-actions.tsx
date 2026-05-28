"use client";

import { useActionState } from "react";
import {
  createProposalRevisionAction,
  recordProposalAcceptanceAction,
  sendProposalAction,
  withdrawProposalAction,
  type ProposalActionState,
} from "@/app/(app)/jobs/[id]/proposals/actions";

// ── Phase 8 batch 8c.11b — proposal lifecycle buttons (status-conditioned) ────────────
// Each button is a useActionState form (pending + inline {error}). Visibility matches the 8c.5
// guards: draft→Send; sent/viewed→Accept/Decline/Withdraw; accepted→Revise (NOT withdraw —
// accepted is live-for-chain but not withdrawable); terminal→Revise. The inline error is the
// race backstop; the UI only offers an action the data layer would accept.

type BoundAction = (state: ProposalActionState, payload: FormData) => Promise<ProposalActionState>;

const VARIANTS = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  danger: "border border-red-300 text-red-700 hover:bg-red-50",
  default: "border border-neutral-300 text-neutral-700 hover:bg-neutral-50",
} as const;

function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "default",
}: {
  action: BoundAction;
  label: string;
  pendingLabel: string;
  variant?: keyof typeof VARIANTS;
}) {
  const [state, formAction, pending] = useActionState<ProposalActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function ProposalActions({
  proposalId,
  jobId,
  status,
}: {
  proposalId: string;
  jobId: string;
  status: string;
}) {
  const isDraft = status === "draft";
  const isPending = status === "sent" || status === "viewed";
  const isAccepted = status === "accepted";
  const isTerminal = status === "declined" || status === "withdrawn" || status === "expired" || status === "superseded";

  return (
    <div className="flex flex-wrap items-start gap-2">
      {isDraft && (
        <ActionButton action={sendProposalAction.bind(null, proposalId, jobId)} label="Send" pendingLabel="Sending…" variant="primary" />
      )}
      {isPending && (
        <>
          <ActionButton action={recordProposalAcceptanceAction.bind(null, proposalId, jobId, "accepted")} label="Accept" pendingLabel="Recording…" variant="primary" />
          <ActionButton action={recordProposalAcceptanceAction.bind(null, proposalId, jobId, "declined")} label="Decline" pendingLabel="Recording…" variant="default" />
          <ActionButton action={withdrawProposalAction.bind(null, proposalId, jobId)} label="Withdraw" pendingLabel="Withdrawing…" variant="danger" />
        </>
      )}
      {(isAccepted || isTerminal) && (
        <ActionButton action={createProposalRevisionAction.bind(null, proposalId, jobId)} label="Revise" pendingLabel="Creating…" variant="primary" />
      )}
    </div>
  );
}
