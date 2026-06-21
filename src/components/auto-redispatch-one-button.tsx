"use client";

import { useActionState } from "react";
import {
  autoRedispatchOneAction,
  type AutoRedispatchOneState,
} from "@/app/(app)/notifications/actions";

// Phase 28 / T2a — "Auto-retry now" on a stuck exception row. Fires the gate-governed autonomous
// re-dispatch (T1) for THIS assignment, under the tenant's policy + conditions. Distinct from the
// rung-1 "Suggest replacement" (manual: prepares a DRAFT for the operator to approve) — this one
// ACTS under policy: auto-sends if permitted, else leaves a suggestion held for review. Secondary
// style; the outcome line is tone-coded (good / held-for-review / neutral).
export function AutoRedispatchOneButton({ stuckAssignmentId }: { stuckAssignmentId: string }) {
  const action = autoRedispatchOneAction.bind(null, stuckAssignmentId);
  const [state, formAction, pending] = useActionState<AutoRedispatchOneState | null, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Retrying…" : "Auto-retry now"}
      </button>
      {state && "error" in state && state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state && "ok" in state && state.ok && (
        <p
          className={
            state.tone === "good"
              ? "text-sm font-medium text-green-700"
              : state.tone === "warn"
                ? "text-sm font-medium text-amber-700"
                : "text-sm text-neutral-600"
          }
        >
          {state.outcome}
        </p>
      )}
    </form>
  );
}
