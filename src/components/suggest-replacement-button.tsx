"use client";

import { useActionState } from "react";
import {
  prepareRedispatchSuggestionAction,
  type PrepareRedispatchState,
} from "@/app/(app)/jobs/[id]/dispatch/new/actions";

// Phase 28: "Suggest replacement" on a stuck vendor_not_accepted exception row. Prepares (not
// sends) a re-dispatch DRAFT to the next eligible vendor; on success the action revalidates the
// job, and the exceptions row re-renders to "suggestion_ready" on next load. Secondary style — this
// is the "prepare" step, not the consequential send. Surfaces the on-click no-eligible-vendor /
// max-attempts exhaustion (the case NOT pre-computed in the list query).
export function SuggestReplacementButton({
  jobId,
  stuckAssignmentId,
}: {
  jobId: string;
  stuckAssignmentId: string;
}) {
  const action = prepareRedispatchSuggestionAction.bind(null, jobId, stuckAssignmentId);
  const [state, formAction, pending] = useActionState<PrepareRedispatchState | null, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Finding a vendor…" : "Suggest replacement"}
      </button>
      {state && "error" in state && state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state && "ok" in state && state.ok && state.result.kind === "exhausted" && (
        <p className="text-sm font-medium text-red-800">
          {state.result.reason === "no_eligible_vendor"
            ? "No eligible vendor available — needs manual attention"
            : "Maximum attempts reached — needs manual attention"}
        </p>
      )}
    </form>
  );
}
