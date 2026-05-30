"use client";

import { useActionState } from "react";
import { createVendorPhotoPlaceholderAction } from "@/app/(vendor)/vendor/jobs/photo-actions";

type ActionState = { error?: string } | null;

/**
 * Photo-placeholder creation form. No actual file upload — writes a
 * metadata-only job_attachments row with NULL file_url (Fork 7). The UI is
 * explicit about this to set expectations. Mirrors VendorNoteForm's shape.
 *
 * Phase 10 batch 10m-construct.
 */
export function VendorPhotoPlaceholderForm({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createVendorPhotoPlaceholderAction.bind(null, assignmentId),
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Photo title
        </label>
        <input
          type="text"
          name="title"
          required
          maxLength={255}
          placeholder="e.g. Compressor nameplate before service"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-500">
          File upload coming soon — for now, attach a placeholder with a title.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Attaching…" : "Attach placeholder"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
