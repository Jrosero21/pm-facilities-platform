"use client";

import { useActionState } from "react";
import { createVendorPhotoPlaceholderAction } from "@/app/(vendor)/vendor/jobs/photo-actions";

type ActionState = { error?: string } | null;

/**
 * Photo attachment form. Title required; an optional image file (Phase 20 20b) is uploaded
 * to object storage by the action. With no file selected, the existing metadata-only
 * placeholder path runs (storage_key NULL). Mirrors VendorNoteForm's shape.
 *
 * The file input offers mobile camera capture (capture="environment") with desktop file
 * selection as the fallback; its name is `file` to match the action's FormData read. React
 * server-action forms serialize File entries into the action's FormData (multipart is handled
 * automatically when a File is present), so the bytes reach createVendorPhotoPlaceholderAction.
 *
 * Phase 10 batch 10m-construct; Phase 20 20b real-bytes.
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
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Photo (optional)
        </label>
        <input
          type="file"
          name="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-800"
        />
        <p className="mt-1 text-xs text-neutral-500">
          JPG, PNG, WEBP, or HEIC up to 15 MB. Leave empty to attach a title-only placeholder.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Attaching…" : "Attach photo"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
