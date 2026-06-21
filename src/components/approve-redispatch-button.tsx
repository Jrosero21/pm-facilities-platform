"use client";

import { useActionState } from "react";
import {
  approveRedispatchAction,
  type ApproveRedispatchState,
} from "@/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions";

// Phase 28: the approve control for a RE-DISPATCH suggestion DRAFT (replaces_assignment_id set).
// Unlike a plain Send, this ghosts the stuck assignment AND sends this DRAFT (ordered-with-
// recovery). Rendered in place of SendDispatchButton on a re-dispatch DRAFT — the guard that
// keeps a suggestion from being plain-sent (which would leave the stuck vendor un-ghosted).
export function ApproveRedispatchButton({
  jobId,
  draftAssignmentId,
}: {
  jobId: string;
  draftAssignmentId: string;
}) {
  const action = approveRedispatchAction.bind(null, jobId, draftAssignmentId);
  const [state, formAction, pending] = useActionState<ApproveRedispatchState | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Ghosting + sending…" : "Approve re-dispatch"}
      </button>
      <p className="text-xs text-neutral-500">
        Approving ghosts the unresponsive vendor and sends this dispatch.
      </p>
      {state && "error" in state && state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
