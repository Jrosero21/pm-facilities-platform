"use client";

import { useActionState } from "react";
import type { JobNoteActionState } from "@/app/(app)/jobs/note-actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type NoteAction = (
  prev: JobNoteActionState,
  formData: FormData,
) => Promise<JobNoteActionState>;

// Minimal note form. visibility is hardcoded to internal_only in the data layer
// (D-4.x) — Phase 4 exposes no visibility picker.
export function JobNoteForm({ action }: { action: NoteAction }) {
  const [state, formAction, pending] = useActionState<JobNoteActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Note</span>
        <textarea name="body" required rows={3} className={inputClass} />
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add note"}
      </button>
    </form>
  );
}
