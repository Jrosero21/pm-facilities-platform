"use client";

import { useActionState } from "react";
import {
  autoRedispatchSweepAction,
  type AutoRedispatchSweepState,
} from "@/app/(app)/notifications/actions";

// Phase 28 / T2b — "Auto-retry all eligible" tenant-level sweep. Fires the gate-governed T1 on every
// can_suggest stuck dispatch SEQUENTIALLY (the action enforces the await-each spend-aggregate guard).
// Primary style — the "do all" companion to the per-row "Auto-retry now". The per-job T1 stays fully
// gated; the sweep adds no permission.
export function AutoRedispatchSweepButton() {
  const [state, formAction, pending] = useActionState<AutoRedispatchSweepState | null, FormData>(
    autoRedispatchSweepAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sweeping…" : "Auto-retry all eligible"}
      </button>
      {state && "error" in state && state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state && "ok" in state && state.ok && (
        <p className="text-sm text-neutral-700">
          {state.summary.swept === 0
            ? "No eligible stuck jobs to auto-retry."
            : `Swept ${state.summary.swept} stuck job${state.summary.swept === 1 ? "" : "s"} → ${state.summary.autoSent} auto-retried, ${state.summary.heldForReview} held for review, ${state.summary.skipped} skipped.`}
        </p>
      )}
    </form>
  );
}
