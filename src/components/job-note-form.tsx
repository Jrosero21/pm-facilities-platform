"use client";

import { useActionState, useState } from "react";
import type { JobNoteActionState } from "@/app/(app)/jobs/note-actions";
import {
  NOTE_VISIBILITY_OPTIONS,
  type NoteVisibility,
} from "@/components/note-visibility-badge";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type NoteAction = (
  prev: JobNoteActionState,
  formData: FormData,
) => Promise<JobNoteActionState>;

// Note form with a visibility picker (Phase 6 6b). Visibility is a CLASSIFICATION:
// it does not share the note — sharing is a separate explicit action (post-6d,
// R-5.8). Default internal_only (pre-fill discipline R-5.11). requires_review gets
// disclosure text because its review workflow ships later.
export function JobNoteForm({ action }: { action: NoteAction }) {
  const [state, formAction, pending] = useActionState<JobNoteActionState, FormData>(
    action,
    null,
  );
  const [visibility, setVisibility] = useState<NoteVisibility>("internal_only");

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Note</span>
        <textarea name="body" required rows={3} className={inputClass} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Visibility</span>
        <select
          name="visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
          className={inputClass}
        >
          {NOTE_VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {visibility === "requires_review" && (
          <span className="mt-1 block text-xs italic text-neutral-500">
            This note will be flagged for review. The review workflow ships in a later phase.
          </span>
        )}
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
