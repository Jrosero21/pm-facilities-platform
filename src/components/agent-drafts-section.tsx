"use client";

import { useActionState, useState, type ReactNode } from "react";
import { ConfidenceBadge } from "@/components/confidence-badge";

// ── v2.10.1 — shared agent-draft review shell ─────────────────────────────────────────
// Extracts the chrome the scope/update draft sections each re-implement, so the invoice and
// proposal draft sections share ONE implementation of the three attention groups + reject/discard
// + dismissed history, and supply only their agent-specific editor (the approve <form> body) and
// approved-row body (the publish <form> body) via slots. The shell NEVER names a hidden field or
// wraps the editor in a form — the editor owns its own <form> + field name (so invoice's
// `editedContent` vs proposal's `editedProposal`, and proposal's `forceClientReview` publish, all
// live in the slots). Tailwind literals match scope-drafts-section.tsx exactly.
//
// NOT migrating scope/update onto this shell (banked cleanup); this ships invoice + proposal only.

// The chrome fields BOTH detailed readers expose (InvoiceDraftDetailed / ProposalDraftDetailed):
// id, status, confidence, rationale, createdAt, lineCount — verified identical, no naming mismatch.
export type AgentDraftChrome = {
  id: string;
  status: string;
  confidence: string | null;
  rationale: string | null;
  createdAt: Date;
  lineCount: number | null;
};

// Both agents' action states are structurally identical ({ error } | null).
export type DraftActionState = { error: string } | null;
// A bound server action ready for useActionState. A bound action with FEWER params (invoice/proposal
// discard + invoice publish take no formData) is assignable here — fewer-param functions are
// assignable to a more-param function type in TS (the existing scope/update code relies on this).
export type DraftFormAction = (state: DraftActionState, formData: FormData) => DraftActionState | Promise<DraftActionState>;
// The page passes bind-factories so the shell can bind per-draft: (draftId) => action.bind(null, jobId, draftId).
export type BoundActionFactory = (draftId: string) => DraftFormAction;

// Shared editor input class (exported so the per-agent editors match the look).
export const inputClass = "mt-1 block w-full rounded border border-neutral-300 px-2 py-1 text-sm";

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function AgentDraftsSection<TDraft extends AgentDraftChrome>({
  drafts,
  title,
  renderEditor,
  renderApprovedBody,
  rejectAction,
  discardAction,
}: {
  drafts: TDraft[];
  title: string;
  renderEditor: (draft: TDraft) => ReactNode;
  renderApprovedBody: (draft: TDraft) => ReactNode;
  rejectAction: BoundActionFactory;
  discardAction: BoundActionFactory;
}) {
  const pending = drafts.filter((d) => d.status === "pending_review");
  const approved = drafts.filter((d) => d.status === "approved");
  const dismissed = drafts.filter((d) => d.status === "rejected" || d.status === "discarded");
  // published drafts are excluded — a published draft IS its materialized record.
  if (pending.length === 0 && approved.length === 0 && dismissed.length === 0) {
    return <p className="mt-3 text-sm text-neutral-600">No {title} yet.</p>;
  }

  return (
    <div className="mt-3 space-y-5">
      {pending.length > 0 && (
        <Group title={`Pending review (${pending.length})`}>
          {pending.map((d) => (
            <PendingRow
              key={d.id}
              draft={d}
              editor={renderEditor(d)}
              reject={rejectAction(d.id)}
              discard={discardAction(d.id)}
            />
          ))}
        </Group>
      )}
      {approved.length > 0 && (
        <Group title={`Ready to publish (${approved.length})`}>
          {approved.map((d) => (
            <ApprovedRow key={d.id} body={renderApprovedBody(d)} />
          ))}
        </Group>
      )}
      {dismissed.length > 0 && <DismissedList drafts={dismissed} />}
    </div>
  );
}

function rowMeta(draft: AgentDraftChrome): string {
  const lines = draft.lineCount != null ? `${draft.lineCount} line${draft.lineCount === 1 ? "" : "s"} · ` : "";
  return `${lines}${draft.createdAt.toLocaleString()}`;
}

// Non-generic — receives the already-rendered editor node + the bound reject/discard actions.
function PendingRow({ draft, editor, reject, discard }: { draft: AgentDraftChrome; editor: ReactNode; reject: DraftFormAction; discard: DraftFormAction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={draft.confidence} />
            <span className="text-xs text-neutral-500">{rowMeta(draft)}</span>
          </div>
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
          {draft.rationale && (
            <Field label="Rationale">
              <p className="text-sm text-neutral-700">{draft.rationale}</p>
            </Field>
          )}
          {editor}
          <RejectForm action={reject} />
          <DiscardForm action={discard} />
        </div>
      )}
    </div>
  );
}

function RejectForm({ action }: { action: DraftFormAction }) {
  const [state, formAction, pending] = useActionState<DraftActionState, FormData>(action, null);
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

function DiscardForm({ action }: { action: DraftFormAction }) {
  const [state, formAction, pending] = useActionState<DraftActionState, FormData>(action, null);
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

function ApprovedRow({ body }: { body: ReactNode }) {
  return <div className="rounded-lg border border-neutral-200 bg-white p-4">{body}</div>;
}

function DismissedList({ drafts }: { drafts: AgentDraftChrome[] }) {
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
              <p className="mt-1 text-sm text-neutral-600">{rowMeta(d)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
