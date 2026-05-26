"use client";

import { useActionState, useState } from "react";
import type { DraftListItemDetailed } from "@/server/agents/drafts";
import { ConfidenceBadge } from "@/components/confidence-badge";
import {
  approveDraftAction,
  rejectDraftAction,
  discardDraftAction,
  publishDraftAction,
  type RewriterActionState,
} from "@/app/(app)/jobs/rewriter-actions";

type Meta = { strippedItems?: string[]; rephrasings?: string[] };
function metaOf(d: DraftListItemDetailed): Meta {
  return (d.decisionMetadata ?? {}) as Meta;
}

// The rewriter draft queue (6g.b). Three attention modes as sub-sections (Lock 5 refinement):
// Pending review → act; Ready to publish → publish; Dismissed → read-only history.
// PUBLISHED drafts are excluded entirely — a published draft IS its communication (shown in
// Communications + Timeline), the 6c.1 dedup principle generalized.
export function UpdateDraftsSection({
  jobId,
  drafts,
  notesById,
  clientName,
}: {
  jobId: string;
  drafts: DraftListItemDetailed[];
  notesById: Record<string, string>;
  clientName: string | null;
}) {
  if (drafts.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-600">
        No update drafts yet. Use “Draft client update” on a note to generate one.
      </p>
    );
  }
  const pending = drafts.filter((d) => d.status === "pending_review");
  const approved = drafts.filter((d) => d.status === "approved");
  const dismissed = drafts.filter((d) => d.status === "rejected" || d.status === "discarded");

  return (
    <div className="mt-3 space-y-5">
      {pending.length > 0 && (
        <Group title={`Pending review (${pending.length})`}>
          {pending.map((d) => (
            <PendingRow key={d.id} jobId={jobId} draft={d} sourceBody={notesById[d.sourceId]} />
          ))}
        </Group>
      )}
      {approved.length > 0 && (
        <Group title={`Ready to publish (${approved.length})`}>
          {approved.map((d) => (
            <ApprovedRow key={d.id} jobId={jobId} draft={d} clientName={clientName} />
          ))}
        </Group>
      )}
      {dismissed.length > 0 && <DismissedList drafts={dismissed} />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function PendingRow({
  jobId,
  draft,
  sourceBody,
}: {
  jobId: string;
  draft: DraftListItemDetailed;
  sourceBody: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const meta = metaOf(draft);
  const stripped = meta.strippedItems ?? [];
  const rephrasings = meta.rephrasings ?? [];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={draft.confidence} />
            <span className="text-xs text-neutral-500">from note · {draft.createdAt.toLocaleString()}</span>
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap text-sm text-neutral-800">{draft.draftContent}</p>
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
          <Field label="Original note">
            <p className="whitespace-pre-wrap text-sm text-neutral-700">{sourceBody ?? "(source note unavailable)"}</p>
          </Field>
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
          {draft.rationale && (
            <Field label="Rationale">
              <p className="text-sm text-neutral-700">{draft.rationale}</p>
            </Field>
          )}

          <ApproveForm jobId={jobId} draft={draft} />
          <RejectForm jobId={jobId} draftId={draft.id} />
          <DiscardForm jobId={jobId} draftId={draft.id} />
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

function ApproveForm({ jobId, draft }: { jobId: string; draft: DraftListItemDetailed }) {
  const action = approveDraftAction.bind(null, jobId, draft.id);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <form action={formAction}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Client-facing draft (editable)</p>
      <textarea
        name="editedContent"
        defaultValue={draft.draftContent}
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

function ApprovedRow({
  jobId,
  draft,
  clientName,
}: {
  jobId: string;
  draft: DraftListItemDetailed;
  clientName: string | null;
}) {
  const action = publishDraftAction.bind(null, jobId, draft.id);
  const [state, formAction, pending] = useActionState<RewriterActionState, FormData>(action, null);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="whitespace-pre-wrap text-sm text-neutral-800">{draft.draftContent}</p>
      <p className="mt-2 text-xs text-neutral-500">
        → Client portal{clientName ? ` · ${clientName}` : ""} · saved as a draft you Send after.
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

function DismissedList({ drafts }: { drafts: DraftListItemDetailed[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-600"
      >
        {open ? "▾" : "▸"} Dismissed ({drafts.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {drafts.map((d) => (
            <div key={d.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{d.status}</span>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-neutral-600">{d.draftContent}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
