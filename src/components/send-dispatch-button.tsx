"use client";

import { useActionState } from "react";
import {
  sendDispatchAction,
  type SendDispatchState,
} from "@/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions";

// Server-action button (no client fetch) with the Phase-4 useActionState wrapper
// for pending + inline error. On success the action revalidates the page, which
// re-renders as SENT — the button disappears (only shown while status === DRAFT).
export function SendDispatchButton({ assignmentId }: { assignmentId: string }) {
  const action = sendDispatchAction.bind(null, assignmentId);
  const [state, formAction, pending] = useActionState<SendDispatchState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send dispatch"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
