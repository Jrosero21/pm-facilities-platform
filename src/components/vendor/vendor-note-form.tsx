"use client";

import { useActionState } from "react";
import { createVendorNoteAction } from "@/app/(vendor)/vendor/jobs/note-actions";

type ActionState = { error?: string } | null;

/**
 * Body-only vendor note form. Writes default to origin='vendor' +
 * visibility='internal_only' (DoR-10l.1), set server-side in createVendorNote.
 * Mirrors VendorDeclineForm's useActionState + FormData shape.
 *
 * Phase 10 batch 10l-construct.
 */
export function VendorNoteForm({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createVendorNoteAction.bind(null, assignmentId),
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm font-medium text-neutral-700">
        Add a note
      </label>
      <textarea
        name="body"
        rows={3}
        required
        className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Add note"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
