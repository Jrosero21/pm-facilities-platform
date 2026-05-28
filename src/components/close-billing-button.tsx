"use client";

import { useActionState, useState } from "react";
import { markBillingClosedAction, type BillingCloseActionState } from "@/app/(app)/jobs/billing-actions";

// ── Phase 8 batch 8c.11e — billing-close button (confirm + accounting-gated) ──────────
// Renders only for accounting users (canAccount; the action is the backstop) and only when the
// job isn't already billing-closed. A confirm checkbox gates the (irreversible) close; the soft
// readiness signal is shown separately by the Billing section (8c.11a) — advisory, never blocking.

export function CloseBillingButton({
  jobId,
  canAccount,
  alreadyClosed,
}: {
  jobId: string;
  canAccount: boolean;
  alreadyClosed: boolean;
}) {
  const action = markBillingClosedAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<BillingCloseActionState, FormData>(action, null);
  const [confirmed, setConfirmed] = useState(false);

  if (alreadyClosed) {
    return <p className="text-sm text-emerald-700">Billing is closed for this job.</p>;
  }
  if (!canAccount) {
    return <p className="text-sm text-neutral-500">Closing billing requires the accounting role.</p>;
  }

  return (
    <form action={formAction} className="space-y-2">
      <label className="block text-sm font-medium text-neutral-700">
        Note <span className="font-normal text-neutral-400">(optional)</span>
        <textarea
          name="note"
          rows={2}
          placeholder="e.g. final invoice issued; written off remaining balance"
          className="mt-1 block w-full max-w-xl rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I understand closing billing is final (the job moves to Closed (Billed)).
      </label>
      <button
        type="submit"
        disabled={pending || !confirmed}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Closing…" : "Close billing"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
