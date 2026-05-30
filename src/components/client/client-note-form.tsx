"use client";

import { useActionState } from "react";
import {
  createClientNoteAction,
  type ClientNoteActionResult,
} from "@/app/(client)/client/jobs/[id]/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

/**
 * Client "add an update" form — Phase 11 batch 11g.
 *
 * Mirrors VendorNoteForm's useActionState + FormData shape, in the reconciled
 * client house idiom (shared inputClass, rounded-md, focus-ring). Client-facing
 * copy ("update", not "note" jargon) — consistent with the Option-(b) plain
 * team-update framing of the notes list. The write lands origin='client',
 * visibility='client_visible' server-side in createClientNote.
 */
export function ClientNoteForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState<
    ClientNoteActionResult | null,
    FormData
  >(createClientNoteAction.bind(null, jobId), null);

  return (
    <form action={formAction} className="space-y-2">
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Add an update
        </span>
        <textarea
          name="body"
          rows={3}
          required
          className={inputClass}
          placeholder="Share more detail or ask a question…"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add update"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
