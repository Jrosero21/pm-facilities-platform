"use client";

import { useActionState } from "react";
import {
  sendCommunicationAction,
  updateDeliveryStatusAction,
  type CommActionState,
} from "@/app/(app)/jobs/communication-actions";
import {
  legalDeliveryTransitions,
  deliveryStatusLabel,
  type DeliveryStatus,
} from "@/components/delivery-status-badge";

// Renders one button per legal delivery transition from the current status (the state
// machine, operable). Terminal states render nothing. Each button advances delivery_status
// via the server action (Send/Mark — distinct from Share, which created the comm).
export function DeliveryTransitionButtons({
  jobId,
  commId,
  status,
}: {
  jobId: string;
  commId: string;
  status: string;
}) {
  const next = legalDeliveryTransitions(status);
  if (next.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {next.map((to) => (
        <TransitionButton key={to} jobId={jobId} commId={commId} to={to} />
      ))}
    </div>
  );
}

function TransitionButton({
  jobId,
  commId,
  to,
}: {
  jobId: string;
  commId: string;
  to: DeliveryStatus;
}) {
  // 'sent' routes through the REAL send path (provider adapter, capture-by-default); every
  // other transition stays on the pure status flip. sendCommunicationAction is (jobId, commId)
  // — it resolves+sends, so it takes no `to` arg.
  const action =
    to === "sent"
      ? sendCommunicationAction.bind(null, jobId, commId)
      : updateDeliveryStatusAction.bind(null, jobId, commId, to);
  const [state, formAction, pending] = useActionState<CommActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "…" : to === "sent" ? "Send" : `Mark ${deliveryStatusLabel(to).toLowerCase()}`}
      </button>
      {state?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
