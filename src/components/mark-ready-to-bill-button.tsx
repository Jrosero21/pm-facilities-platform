"use client";

import { useActionState, useState } from "react";
import { markJobReadyToBillAction, type ReadyToBillState } from "@/app/(app)/jobs/actions";

// ── CF-27.16 Piece 1 — ops→accounting handoff button ──────────────────────────────────
// The OPERATIONS inverse of CloseBillingButton: an operator marks the job ready to bill (→ Pending
// Invoice = "ops is done, accounting bill it"). Operations-gated (canOperate; the action is the
// backstop). LIGHT confirm — the handoff is REVERSIBLE (ops can move the job again), so a simple
// confirm checkbox, not the irreversible-close ack. Renders nothing for non-eligible states
// (terminal jobs); a quiet indicator when already sent.
export function MarkReadyToBillButton({
  jobId,
  canOperate,
  alreadyReady,
  eligible,
}: {
  jobId: string;
  canOperate: boolean;
  /** job is already at PENDING_INVOICE */
  alreadyReady: boolean;
  /** job is in a non-terminal, not-yet-handed-off status (an allowed from) */
  eligible: boolean;
}) {
  const action = markJobReadyToBillAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<ReadyToBillState, FormData>(action, null);
  const [confirmed, setConfirmed] = useState(false);

  if (alreadyReady) {
    return <p className="text-sm text-emerald-700">Sent to accounting — ready to bill.</p>;
  }
  if (!canOperate || !eligible) {
    // Non-operators, or terminal jobs (Completed/Cancelled/Closed) — no handoff control.
    return null;
  }

  return (
    <form action={formAction} className="space-y-2">
      <label className="block text-sm font-medium text-neutral-700">
        Note <span className="font-normal text-neutral-400">(optional)</span>
        <textarea
          name="note"
          rows={2}
          placeholder="e.g. all on-site work done; one vendor invoice still pending"
          className="mt-1 block w-full max-w-xl rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Send this job to accounting (ops complete).
      </label>
      <button
        type="submit"
        disabled={pending || !confirmed}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Mark ops complete — send to accounting"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
