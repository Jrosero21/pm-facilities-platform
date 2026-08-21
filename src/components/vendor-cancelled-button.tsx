"use client";

import { useActionState, useState } from "react";
import {
  vendorCancelledRedispatchAction,
  type VendorCancelledState,
} from "@/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions";

// ── FOUNDATION Gap 5 — "the vendor cancelled" (choreography outcome 1c) ───────────────
// Collapsed behind a button, then a short confirm form — because this is destructive in the sense
// that matters: it CLOSES the current dispatch. Two steps, not one click, and the copy says what
// will happen before it happens.
//
// Deliberately worded around the VENDOR's action ("Vendor cancelled") rather than the operator's
// ("Cancel dispatch"), because that is the fact being recorded — and because it is what stops this
// being confused with the CANCELLED status an operator sets when the CLIENT calls the job off.

export function VendorCancelledButton({
  jobId,
  assignmentId,
  vendorName,
}: {
  jobId: string;
  assignmentId: string;
  vendorName: string;
}) {
  const action = vendorCancelledRedispatchAction.bind(null, jobId, assignmentId);
  const [state, formAction, pending] = useActionState<VendorCancelledState, FormData>(action, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50"
      >
        Vendor cancelled — re-dispatch
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">
          {vendorName} cancelled — re-dispatch
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-neutral-700">
        This closes the current dispatch as <strong>declined</strong> — recording that the vendor
        responded and withdrew, not that they went silent — and opens a linked replacement for you
        to assign to a new vendor. Scope, NTE and schedule carry over.
      </p>

      <label className="block text-sm">
        <span className="text-neutral-700">Reason (optional)</span>
        <input
          type="text"
          name="reason"
          maxLength={500}
          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          placeholder="Truck broke down — can't make today."
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Re-dispatching…" : "Close and re-dispatch"}
      </button>
    </form>
  );
}
