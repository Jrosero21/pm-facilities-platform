"use client";

import { useActionState } from "react";
import {
  shareNoteAction,
  type CommActionState,
} from "@/app/(app)/jobs/communication-actions";
import type { ShareAudience } from "@/server/communications";

// "Share with client" / "Share with vendor" — creates a communication_logs row from a
// note (SHARE-EXISTING). Share ≠ Send: the comm starts at delivery_status='draft'. Shown
// only for visibilities that permit the audience (the page decides which buttons render).
export function ShareNoteButton({
  jobId,
  noteId,
  audience,
}: {
  jobId: string;
  noteId: string;
  audience: ShareAudience;
}) {
  const action = shareNoteAction.bind(null, jobId, noteId, audience);
  const [state, formAction, pending] = useActionState<CommActionState, FormData>(action, null);
  const label = audience === "client" ? "Share with client" : "Share with vendor";
  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sharing…" : label}
      </button>
      {state?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
