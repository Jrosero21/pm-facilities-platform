"use client";

import { useActionState } from "react";
import {
  resendWorkOrderAction,
  type ResendWorkOrderState,
} from "@/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions";

// ── vendor-WO batch 4 — WORK ORDER CONTROLS ───────────────────────────────────────────
// Two affordances on the assignment workspace, mirroring client-invoice-actions.tsx:
//   1. an anchor to the on-demand render route (no action, no state — the browser downloads it)
//   2. a resend button that re-renders and re-emails the current document
//
// The download is a plain <a>, not a form: the route streams an attachment, so navigation IS the
// interaction and a server action would only add a round trip. target="_blank" keeps the operator
// on the workspace when the browser opens the PDF in a tab.

export function WorkOrderActions({
  jobId,
  assignmentId,
}: {
  jobId: string;
  assignmentId: string;
}) {
  const action = resendWorkOrderAction.bind(null, jobId, assignmentId);
  const [state, formAction, pending] = useActionState<ResendWorkOrderState, FormData>(
    action,
    null,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/dispatch-assignments/${assignmentId}/work-order`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Work Order PDF
        </a>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Sending…" : "Resend to vendor"}
          </button>
        </form>
      </div>
      {/* Both outcomes are reported. A resend is a deliberate act with an external effect, so
          "it worked, and here is who received it" is as important as the failure case. */}
      {state?.info && (
        <p role="status" className="text-xs text-neutral-600">
          {state.info}
        </p>
      )}
      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </div>
  );
}
