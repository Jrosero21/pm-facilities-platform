"use client";

import { useActionState } from "react";
import {
  approveChangeOrderAction,
  declineChangeOrderAction,
  submitChangeOrderAction,
  withdrawChangeOrderAction,
  type ChangeOrderActionState,
} from "@/app/(app)/jobs/[id]/change-orders/actions";

// ── Phase 8 batch 8c.11c — change-order lifecycle buttons (status-conditioned) ────────
// Mirrors proposal-actions.tsx, but the CO lifecycle has NO Revise (8c-D5: COs are forward
// deltas; a "redo" is a new CO). draft → Submit; submitted → Approve/Decline/Withdraw;
// approved/declined/withdrawn → terminal (no actions, read-only). "Approve" maps to the
// {accepted} decision in the data layer (CF-8c.6.1) — invisible here.

type BoundAction = (state: ChangeOrderActionState, payload: FormData) => Promise<ChangeOrderActionState>;

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
  const [state, formAction, pending] = useActionState<ChangeOrderActionState, FormData>(action, null);
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

export function ChangeOrderActions({
  changeOrderId,
  jobId,
  status,
}: {
  changeOrderId: string;
  jobId: string;
  status: string;
}) {
  const isDraft = status === "draft";
  const isSubmitted = status === "submitted";

  if (!isDraft && !isSubmitted) {
    return <p className="text-sm text-neutral-500">No further actions — this change order is {status}.</p>;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {isDraft && (
        <>
          <ActionButton action={submitChangeOrderAction.bind(null, changeOrderId, jobId)} label="Submit" pendingLabel="Submitting…" variant="primary" />
          <ActionButton action={withdrawChangeOrderAction.bind(null, changeOrderId, jobId)} label="Withdraw" pendingLabel="Withdrawing…" variant="danger" />
        </>
      )}
      {isSubmitted && (
        <>
          <ActionButton action={approveChangeOrderAction.bind(null, changeOrderId, jobId)} label="Approve" pendingLabel="Approving…" variant="primary" />
          <ActionButton action={declineChangeOrderAction.bind(null, changeOrderId, jobId)} label="Decline" pendingLabel="Recording…" variant="default" />
          <ActionButton action={withdrawChangeOrderAction.bind(null, changeOrderId, jobId)} label="Withdraw" pendingLabel="Withdrawing…" variant="danger" />
        </>
      )}
    </div>
  );
}
