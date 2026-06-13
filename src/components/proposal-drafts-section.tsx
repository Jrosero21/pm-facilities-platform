"use client";

import { useActionState, useState } from "react";
import type { ProposalDraftDetailed } from "@/server/agents/proposal-generator/drafts";
import type { ProposedProposalLine } from "@/server/agents/proposal-generator/drafts";
import {
  AgentDraftsSection,
  Field,
  inputClass,
  type DraftActionState,
} from "@/components/agent-drafts-section";
import {
  approveProposalDraftAction,
  rejectProposalDraftAction,
  discardProposalDraftAction,
  publishProposalDraftAction,
  previewProposalRoutingAction,
  type ProposalRoutingPreview,
} from "@/app/(app)/jobs/proposal-actions";

// ── v2.10.1 — proposal draft review section ───────────────────────────────────────────
// The proposal agent's editor over the shared shell. The draft is NUMBER-FREE — the operator
// AUTHORS the pricing here (quantity/unit price), editing the AI's category/description/scopePhrasing.
// Approve serializes to a ProposedProposal JSON in a hidden `editedProposal` field. A read-only NTE
// ROUTING PREVIEW (previewProposalRoutingAction) shows "Totals $X · Job NTE $Y → INTERNAL/CLIENT" from
// the editor's current priced lines. Publish carries a `forceClientReview` checkbox (toward-review).
//
// NOTE (data limit): ProposalDraftDetailed does not carry the review's edited_content (no new reader
// per the v2.10.1 scope), so the routing preview lives in the PENDING editor (where the live priced
// line state exists). The Ready-to-publish body shows the number-free proposed lines + the publish
// control; the NTE gate is re-decided authoritatively server-side at publish regardless.

const CATEGORIES = ["labor", "materials", "equipment", "trip", "permit", "fee", "tax", "other"] as const;

type EditableLine = {
  category: string;
  description: string;
  scopePhrasing: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  markupPercent: string;
  taxAmount: string;
  // Phase (ii) Unit 2a — the server-seeded agreed rate + its provenance (hidden). suggestedUnitPrice
  // is the override sentinel: provenance is submitted only while unitPrice still equals it. null ⇒ no
  // rate was pre-filled (non-rate_sheet / no rate on file) → behaves exactly as before.
  suggestedUnitPrice: string | null;
  tradeId: string | null;
  rateType: string | null;
};

function toEditable(lines: ProposedProposalLine[]): EditableLine[] {
  return lines.map((l) => ({
    category: l.category,
    description: l.description,
    scopePhrasing: l.scopePhrasing,
    // number-free draft → operator authors these (seed quantity 1). Phase (ii) Unit 2a: a rate_sheet
    // labor/trip line opens with the agreed rate pre-filled (suggestedUnitPrice); else blank, as
    // before. Still a plain editable input — the operator overwrites freely.
    quantity: l.quantity ?? "1",
    unit: l.unit ?? null,
    unitPrice: l.unitPrice ?? l.suggestedUnitPrice ?? "",
    markupPercent: l.markupPercent ?? "",
    taxAmount: l.taxAmount ?? "0",
    suggestedUnitPrice: l.suggestedUnitPrice ?? null,
    tradeId: l.tradeId ?? null,
    rateType: l.rateType ?? null,
  }));
}

// Serialize to resolveEditedProposal's contract (ProposedProposal). quantity + unit price required.
// Phase (ii) Unit 2a: the agreed-rate provenance (tradeId/rateType) is submitted ONLY when the price
// still equals the pre-filled suggestion — a typed-over price is no longer the agreed rate, so its
// provenance is dropped (publish then bills it as a normal, marked-up operator-authored line).
function serialize(lines: EditableLine[]): string {
  return JSON.stringify({
    lineItems: lines.map((l) => {
      const keptRate = l.suggestedUnitPrice !== null && l.unitPrice === l.suggestedUnitPrice;
      return {
        category: l.category,
        description: l.description,
        scopePhrasing: l.scopePhrasing,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        markupPercent: l.markupPercent === "" ? null : l.markupPercent,
        taxAmount: l.taxAmount,
        ...(keptRate ? { tradeId: l.tradeId, rateType: l.rateType } : {}),
      };
    }),
  });
}

function RoutingPreview({ jobId, draftId, serialized }: { jobId: string; draftId: string; serialized: string }) {
  const [result, setResult] = useState<ProposalRoutingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 p-2">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          try {
            setResult(await previewProposalRoutingAction(jobId, draftId, serialized));
          } finally {
            setLoading(false);
          }
        }}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {loading ? "Checking…" : "Preview routing"}
      </button>
      {result && (
        result.ok ? (
          <p className="mt-2 text-xs text-neutral-700">
            Totals <span className="font-medium">${result.total}</span> · Job NTE{" "}
            <span className="font-medium">{result.effectiveNte === null ? "none" : `$${result.effectiveNte}`}</span> → routes{" "}
            <span className={`font-semibold ${result.willRoute === "internal" ? "text-purple-700" : "text-sky-700"}`}>
              {result.willRoute.toUpperCase()}
            </span>
            {result.willRoute === "internal" && (
              <span className="text-neutral-500"> (Send to client would force CLIENT)</span>
            )}
          </p>
        ) : (
          <p role="alert" className="mt-2 text-xs text-red-600">{result.error}</p>
        )
      )}
    </div>
  );
}

function ProposalApproveEditor({ jobId, draft }: { jobId: string; draft: ProposalDraftDetailed }) {
  const action = approveProposalDraftAction.bind(null, jobId, draft.id);
  const [state, formAction, pending] = useActionState<DraftActionState, FormData>(action, null);
  const [lines, setLines] = useState<EditableLine[]>(() => toEditable(draft.proposedProposal.lineItems));

  const update = (i: number, patch: Partial<EditableLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const serialized = serialize(lines);

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Proposal lines — author the pricing</p>
        <input type="hidden" name="editedProposal" value={serialized} />
        <ol className="mt-1 space-y-2">
          {lines.map((l, i) => (
            <li key={i} className="rounded border border-neutral-200 p-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-neutral-600">
                  Category
                  <select value={l.category} onChange={(e) => update(i, { category: e.target.value })} className={inputClass}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-neutral-600">
                  Description
                  <input value={l.description} onChange={(e) => update(i, { description: e.target.value })} className={inputClass} />
                </label>
                <label className="text-xs text-neutral-600 sm:col-span-2">
                  Scope
                  <textarea value={l.scopePhrasing} onChange={(e) => update(i, { scopePhrasing: e.target.value })} rows={2} className={inputClass} />
                </label>
                <label className="text-xs text-neutral-600">
                  Quantity
                  <input value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} inputMode="decimal" className={inputClass} />
                </label>
                <label className="text-xs text-neutral-600">
                  <span className="flex items-center gap-1">
                    Unit price
                    {l.suggestedUnitPrice !== null &&
                      (l.unitPrice === l.suggestedUnitPrice ? (
                        <span className="rounded bg-emerald-50 px-1 text-[10px] font-medium text-emerald-700">agreed rate</span>
                      ) : (
                        <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700">overridden</span>
                      ))}
                  </span>
                  <input value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} inputMode="decimal" placeholder="author price" className={inputClass} />
                </label>
              </div>
            </li>
          ))}
        </ol>
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
      <RoutingPreview jobId={jobId} draftId={draft.id} serialized={serialized} />
    </div>
  );
}

function ProposalApprovedBody({ jobId, draft }: { jobId: string; draft: ProposalDraftDetailed }) {
  const action = publishProposalDraftAction.bind(null, jobId, draft.id);
  const [state, formAction, pending] = useActionState<DraftActionState, FormData>(action, null);
  return (
    <div>
      <Field label="Proposal lines (priced at review)">
        <ul className="space-y-1 text-sm text-neutral-800">
          {draft.proposedProposal.lineItems.map((l, i) => (
            <li key={i} className="truncate">{l.category} · {l.description}</li>
          ))}
        </ul>
      </Field>
      <p className="mt-2 text-xs text-neutral-500">→ The NTE gate decides INTERNAL (auto-billed) vs CLIENT at publish.</p>
      <form action={formAction} className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-xs text-neutral-600">
          <input type="checkbox" name="forceClientReview" value="true" />
          Send to client (force client review)
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Publishing…" : "Publish proposal"}
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

export function ProposalDraftsSection({ jobId, drafts }: { jobId: string; drafts: ProposalDraftDetailed[] }) {
  return (
    <AgentDraftsSection<ProposalDraftDetailed>
      drafts={drafts}
      title="proposal drafts"
      renderEditor={(d) => <ProposalApproveEditor jobId={jobId} draft={d} />}
      renderApprovedBody={(d) => <ProposalApprovedBody jobId={jobId} draft={d} />}
      rejectAction={(id) => rejectProposalDraftAction.bind(null, jobId, id)}
      discardAction={(id) => discardProposalDraftAction.bind(null, jobId, id)}
    />
  );
}
