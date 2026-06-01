"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { DraftQueueItem } from "@/server/agents/drafts";
import { ConfidenceBadge } from "@/components/confidence-badge";
import {
  approveDraftAction,
  rejectDraftAction,
  discardDraftAction,
  publishDraftAction,
  type RewriterActionState,
} from "@/app/(app)/jobs/rewriter-actions";

type Meta = { strippedItems?: string[]; rephrasings?: string[] };
function metaOf(d: DraftQueueItem): Meta {
  return (d.decisionMetadata ?? {}) as Meta;
}

// Tenant-wide AI-draft review queue (Phase 18b). The cross-job sibling of
// UpdateDraftsSection: same lane/row UX, but each row carries its OWN jobId
// (item.jobId) and binds the existing (jobId, draftId, …) wrappers with it —
// update-drafts-section.tsx stays single-job-bound. Two actionable lanes:
// Pending review → triage; Ready to publish → publish. published is excluded
// upstream; rejected/discarded never enter the queue (they live on job detail).
//
// The lane container is a labeled section per lane so a third lane can be added
// without restructuring. // dual-mode autonomous lane: Phase 18d groundwork, no producer yet.
export function ReviewQueueSection({ items }: { items: DraftQueueItem[] }) {
  const pending = items.filter((d) => d.status === "pending_review");
  const approved = items.filter((d) => d.status === "approved");

  return (
    <div className="mt-6 space-y-6">
      <Lane title={`Pending review (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>Nothing awaiting review.</Empty>
        ) : (
          pending.map((d) => <PendingRow key={d.id} item={d} />)
        )}
      </Lane>
      <Lane title={`Ready to publish (${approved.length})`}>
        {approved.length === 0 ? (
          <Empty>Nothing ready to publish.</Empty>
        ) : (
          approved.map((d) => <ApprovedRow key={d.id} item={d} />)
        )}
      </Lane>
    </div>
  );
}

function Lane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}

function JobLabel({ item }: { item: DraftQueueItem }) {
  return (
    <Link
      href={`/jobs/${item.jobId}`}
      className="text-xs font-medium text-neutral-700 hover:underline"
    >
      #{item.jobNumber} · {item.clientName}
    </Link>
  );
}

function PendingRow({ item }: { item: DraftQueueItem }) {
  const [open, setOpen] = useState(false);
  const meta = metaOf(item);
  const stripped = meta.strippedItems ?? [];
  const rephrasings = meta.rephrasings ?? [];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <JobLabel item={item} />
            <ConfidenceBadge confidence={item.confidence} />
            <span className="text-xs text-neutral-500">{item.createdAt.toLocaleString()}</span>
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap text-sm text-neutral-800">{item.draftContent}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500"
        >
          {open ? "Close" : "Review"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          {stripped.length > 0 && (
            <Field label="Stripped">
              <ul className="list-disc pl-5 text-sm text-neutral-700">
                {stripped.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Field>
          )}
          {rephrasings.length > 0 && (
            <Field label="Rephrased">
              <ul className="list-disc pl-5 text-sm text-neutral-700">
                {rephrasings.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Field>
          )}
          {item.rationale && (
            <Field label="Rationale">
              <p className="text-sm text-neutral-700">{item.rationale}</p>
            </Field>
          )}

          <ApproveForm jobId={item.jobId} draftId={item.id} draftContent={item.draftContent} />
          <RejectForm jobId={item.jobId} draftId={item.id} />
          <DiscardForm jobId={item.jobId} draftId={item.id} />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ApproveForm({
  jobId,
  draftId,
  draftContent,
}: {
  jobId: string;
  draftId: string;
  draftContent: string;
}) {
  const action = approveDraftAction.bind(null, jobId, draftId);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <form action={formAction}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Client-facing draft (editable)</p>
      <textarea
        name="editedContent"
        defaultValue={draftContent}
        rows={4}
        className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "…" : "Approve"}
        </button>
        {state?.error && (
          <span role="alert" className="text-xs text-red-600">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function RejectForm({ jobId, draftId }: { jobId: string; draftId: string }) {
  const action = rejectDraftAction.bind(null, jobId, draftId);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        name="reviewNotes"
        placeholder="Reason to reject…"
        className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {pending ? "…" : "Reject"}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}

function DiscardForm({ jobId, draftId }: { jobId: string; draftId: string }) {
  const action = discardDraftAction.bind(null, jobId, draftId);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-neutral-500 underline hover:text-neutral-800 disabled:opacity-60"
      >
        {pending ? "…" : "Discard"}
      </button>
      {state?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}

function ApprovedRow({ item }: { item: DraftQueueItem }) {
  const action = publishDraftAction.bind(null, item.jobId, item.id);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-1">
        <JobLabel item={item} />
      </div>
      <p className="whitespace-pre-wrap text-sm text-neutral-800">{item.draftContent}</p>
      <p className="mt-2 text-xs text-neutral-500">
        → Client portal · {item.clientName} · saved as a draft you Send after.
      </p>
      <form action={formAction} className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Publishing…" : "Publish to client"}
        </button>
        {state?.error && (
          <span role="alert" className="text-xs text-red-600">
            {state.error}
          </span>
        )}
      </form>
    </div>
  );
}
