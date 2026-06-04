"use client";

import { useActionState } from "react";
import { generateProposalAction, type ProposalDraftActionState } from "@/app/(app)/jobs/proposal-actions";

// "Generate proposal" on the job's Proposals section (per-job, like the scope generator). Sync
// invocation; pending shows "Generating…". On success the draft appears in the ProposalDraftsSection
// (revalidatePath). Mirrors GenerateScopeButton.
export function GenerateProposalButton({ jobId }: { jobId: string }) {
  const action = generateProposalAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<ProposalDraftActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate proposal"}
      </button>
      {state?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
