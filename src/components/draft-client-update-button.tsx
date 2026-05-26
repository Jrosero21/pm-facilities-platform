"use client";

import { useActionState } from "react";
import { draftClientUpdateAction, type RewriterActionState } from "@/app/(app)/jobs/rewriter-actions";

// "Draft client update" on a note row (any visibility — Lock 5a). Sync invocation; pending
// shows "Generating…". On success the draft appears in the Update drafts section
// (revalidatePath). Matches ShareNoteButton / DeliveryTransitionButtons.
export function DraftClientUpdateButton({ jobId, noteId }: { jobId: string; noteId: string }) {
  const action = draftClientUpdateAction.bind(null, jobId, noteId);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Generating…" : "Draft client update"}
      </button>
      {state?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
