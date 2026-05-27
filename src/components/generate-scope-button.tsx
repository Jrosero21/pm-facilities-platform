"use client";

import { useActionState } from "react";
import { generateScopeAction, type ScopeActionState } from "@/app/(app)/jobs/scope-actions";

// "Generate scope" on the job's Scope of work section (per-job, unlike the rewriter's
// per-note trigger). Sync invocation; pending shows "Generating…". On success the draft
// appears in the section (revalidatePath). Mirrors DraftClientUpdateButton.
export function GenerateScopeButton({ jobId }: { jobId: string }) {
  const action = generateScopeAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<ScopeActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate scope"}
      </button>
      {state?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
