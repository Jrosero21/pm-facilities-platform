"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { VendorUpdateItem } from "@/server/job-notes";
import {
  NoteOriginBadge,
  NoteVisibilityBadge,
  NOTE_VISIBILITY_OPTIONS,
} from "@/components/note-visibility-badge";
import { promoteNoteVisibilityAction } from "@/app/(app)/jobs/note-visibility-actions";
import type { RewriterActionState } from "@/app/(app)/jobs/rewriter-actions";

// The two FB-10l.2 promotion targets (mirror PROMOTION_TARGETS in job-notes.ts).
const PROMOTABLE_OPTIONS = NOTE_VISIBILITY_OPTIONS.filter(
  (o) => o.value === "client_visible" || o.value === "client_and_vendor_visible",
);

// Tenant-wide vendor-updates inbox (Phase 18c, FB-10a.3). Reads job_notes where
// origin='vendor'. Operators see every vendor update in one place and can promote
// an internal_only / requires_review note to a client-facing visibility (FB-10l.2).
// Promotion is flip + audit only — NO outbound (Phase 19 owns send).
export function VendorUpdatesInbox({ items }: { items: VendorUpdateItem[] }) {
  return (
    <div className="mt-6 space-y-2">
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </div>
  );
}

function Row({ item }: { item: VendorUpdateItem }) {
  const promotable = item.visibility === "internal_only" || item.visibility === "requires_review";
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${item.jobId}`}
          className="text-xs font-medium text-neutral-700 hover:underline"
        >
          #{item.jobNumber} · {item.clientName}
        </Link>
        <NoteOriginBadge origin={item.origin} />
        <NoteVisibilityBadge visibility={item.visibility} />
        <span className="text-xs text-neutral-500">
          {item.authorName ?? "—"} · {item.createdAt.toLocaleString()}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-neutral-800">{item.body}</p>
      {promotable && <PromoteForm jobId={item.jobId} noteId={item.id} />}
    </div>
  );
}

function PromoteForm({ jobId, noteId }: { jobId: string; noteId: string }) {
  const action = promoteNoteVisibilityAction.bind(null, jobId, noteId);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
      <label className="text-xs font-medium uppercase tracking-wide text-neutral-400">Promote to</label>
      <select
        name="toVisibility"
        defaultValue="client_visible"
        className="rounded border border-neutral-300 px-2 py-1 text-sm"
      >
        {PROMOTABLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "…" : "Promote"}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
