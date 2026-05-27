"use client";

import { useActionState, useState } from "react";
import type { ScopeDraftDetailed, ScopeStep } from "@/server/agents/scope-generator/drafts";
import { ConfidenceBadge } from "@/components/confidence-badge";
import {
  approveScopeDraftAction,
  rejectScopeDraftAction,
  discardScopeDraftAction,
  publishScopeDraftAction,
  type ScopeActionState,
} from "@/app/(app)/jobs/scope-actions";

// The scope draft queue (7d.2). Three attention groups mirroring UpdateDraftsSection:
// Pending review → review/edit/act; Ready to publish → (publish button lands 7d.3);
// Dismissed → read-only history. PUBLISHED drafts are excluded — a published draft IS the
// job's scope (shown in the Scope of work display), the dedup principle generalized.
// Divergence from the rewriter: the edit affordance is a step-list editor, not a textarea.
export function ScopeDraftsSection({
  jobId,
  drafts,
  publishDisabled,
}: {
  jobId: string;
  drafts: ScopeDraftDetailed[];
  publishDisabled: boolean;
}) {
  const pending = drafts.filter((d) => d.status === "pending_review");
  const approved = drafts.filter((d) => d.status === "approved");
  const dismissed = drafts.filter((d) => d.status === "rejected" || d.status === "discarded");
  if (pending.length === 0 && approved.length === 0 && dismissed.length === 0) return null;

  return (
    <div className="mt-3 space-y-5">
      {pending.length > 0 && (
        <Group title={`Pending review (${pending.length})`}>
          {pending.map((d) => (
            <PendingScopeRow key={d.id} jobId={jobId} draft={d} />
          ))}
        </Group>
      )}
      {approved.length > 0 && (
        <Group title={`Ready to publish (${approved.length})`}>
          {approved.map((d) => (
            <ApprovedScopeRow key={d.id} jobId={jobId} draft={d} publishDisabled={publishDisabled} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function PendingScopeRow({ jobId, draft }: { jobId: string; draft: ScopeDraftDetailed }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <ConfidenceBadge confidence={draft.confidence} />
            <span className="text-xs text-neutral-500">
              {draft.proposedSteps.length} steps · {draft.createdAt.toLocaleString()}
            </span>
          </div>
          <p className="line-clamp-2 text-sm text-neutral-800">{draft.proposedSteps[0]?.instruction ?? "—"}</p>
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
          {draft.assumptions.length > 0 && (
            <Field label="Assumptions">
              <ul className="list-disc pl-5 text-sm text-neutral-700">
                {draft.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Field>
          )}
          {draft.rationale && (
            <Field label="Rationale">
              <p className="text-sm text-neutral-700">{draft.rationale}</p>
            </Field>
          )}
          <ApproveScopeForm jobId={jobId} draft={draft} />
          <RejectScopeForm jobId={jobId} draftId={draft.id} />
          <DiscardScopeForm jobId={jobId} draftId={draft.id} />
        </div>
      )}
    </div>
  );
}

// ── The step-list editor (the substrate-divergent core, D3) ───────────────────────────
type EditableStep = { instruction: string; category: string; expectsPhoto: boolean };
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "assess", label: "Assess" },
  { value: "perform", label: "Perform" },
  { value: "cleanup", label: "Cleanup" },
  { value: "verify", label: "Verify" },
  { value: "document", label: "Document" },
];

function toEditable(steps: ScopeStep[]): EditableStep[] {
  return steps.map((s) => ({ instruction: s.instruction, category: s.category ?? "", expectsPhoto: s.expectsPhoto ?? false }));
}
// Serialize to the action's contract (order = 1-based position; category "" → omitted).
function serialize(steps: EditableStep[]): string {
  return JSON.stringify(
    steps.map((s, i) => ({
      order: i + 1,
      instruction: s.instruction,
      ...(s.category ? { category: s.category } : {}),
      expectsPhoto: s.expectsPhoto,
    })),
  );
}

function ApproveScopeForm({ jobId, draft }: { jobId: string; draft: ScopeDraftDetailed }) {
  const action = approveScopeDraftAction.bind(null, jobId, draft.id);
  const [state, formAction, pending] = useActionState<ScopeActionState, FormData>(action, null);
  const [steps, setSteps] = useState<EditableStep[]>(() => toEditable(draft.proposedSteps));

  const update = (i: number, patch: Partial<EditableStep>) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setSteps((prev) => prev.filter((_, j) => j !== i));
  const add = () => setSteps((prev) => [...prev, { instruction: "", category: "", expectsPhoto: false }]);

  return (
    <form action={formAction}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Scope steps (editable)</p>
      <input type="hidden" name="editedSteps" value={serialize(steps)} />
      <ol className="mt-1 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="rounded border border-neutral-200 p-2">
            <div className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-xs text-neutral-400">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <textarea
                  value={s.instruction}
                  onChange={(e) => update(i, { instruction: e.target.value })}
                  rows={2}
                  placeholder="Step instruction…"
                  className="w-full rounded border border-neutral-300 p-2 text-sm"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-neutral-600">
                    Category
                    <select
                      value={s.category}
                      onChange={(e) => update(i, { category: e.target.value })}
                      className="rounded border border-neutral-300 px-1 py-0.5 text-xs"
                    >
                      {CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-neutral-600">
                    <input type="checkbox" checked={s.expectsPhoto} onChange={(e) => update(i, { expectsPhoto: e.target.checked })} />
                    Expects photo
                  </label>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-30" aria-label="Move up">▲</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="px-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-30" aria-label="Move down">▼</button>
                <button type="button" onClick={() => remove(i)} className="px-1 text-xs text-neutral-400 hover:text-red-600" aria-label="Remove step">×</button>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={add} className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500">
          + Add step
        </button>
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

function RejectScopeForm({ jobId, draftId }: { jobId: string; draftId: string }) {
  const action = rejectScopeDraftAction.bind(null, jobId, draftId);
  const [state, formAction, pending] = useActionState<ScopeActionState, FormData>(action, null);
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

function DiscardScopeForm({ jobId, draftId }: { jobId: string; draftId: string }) {
  const action = discardScopeDraftAction.bind(null, jobId, draftId);
  const [state, formAction, pending] = useActionState<ScopeActionState, FormData>(action, null);
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

function ApprovedScopeRow({
  jobId,
  draft,
  publishDisabled,
}: {
  jobId: string;
  draft: ScopeDraftDetailed;
  publishDisabled: boolean;
}) {
  // The approved draft's proposed_steps shown read-only; the operator's edited set (if any)
  // surfaces in the published job_scope_steps after publish (effective = edited ?? proposed).
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-800">
        {draft.proposedSteps.map((s, i) => (
          <li key={i} className="whitespace-pre-wrap">
            {s.instruction}
          </li>
        ))}
      </ol>
      {publishDisabled ? (
        // Courteous gate (DEC-C): explain the disabled state, don't silently hide it. The
        // load-bearing gate is server-side in publishScopeDraft (KL-7.g / SCOPE_ALREADY_PUBLISHED).
        <p className="mt-2 text-xs text-neutral-500">
          Scope already published for this job. This draft can no longer be published. Discard or leave as history.
        </p>
      ) : (
        <PublishScopeForm jobId={jobId} draftId={draft.id} />
      )}
    </div>
  );
}

function PublishScopeForm({ jobId, draftId }: { jobId: string; draftId: string }) {
  const action = publishScopeDraftAction.bind(null, jobId, draftId);
  const [state, formAction, pending] = useActionState<ScopeActionState, FormData>(action, null);
  return (
    <form action={formAction} className="mt-2 flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Publishing…" : "Publish scope"}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}

// Dismissed group distinguishes rejected vs discarded (shows d.status) — mirrors the
// rewriter's DismissedList, which renders the status word (D10: distinguish, by parallelism).
function DismissedList({ drafts }: { drafts: ScopeDraftDetailed[] }) {
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
              <p className="mt-1 line-clamp-2 text-sm text-neutral-600">
                {d.proposedSteps.length} steps · {d.proposedSteps[0]?.instruction ?? "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
