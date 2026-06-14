"use client";

import { useActionState, useState } from "react";
import type { InvoiceDraftDetailed } from "@/server/agents/invoice-creator/drafts";
import type { ProposedInvoiceLine } from "@/server/agents/invoice-creator/drafts";
import {
  AgentDraftsSection,
  Field,
  inputClass,
  type DraftActionState,
} from "@/components/agent-drafts-section";
import {
  approveInvoiceDraftAction,
  rejectInvoiceDraftAction,
  discardInvoiceDraftAction,
  publishInvoiceDraftAction,
} from "@/app/(app)/jobs/invoice-actions";

// ── v2.10.1 — invoice draft review section ────────────────────────────────────────────
// The invoice agent's editor over the shared shell. The draft already CARRIES numbers (the
// vendor-line-driven join), so the operator EDITS them. Approve serializes to a ProposedInvoice
// JSON in a hidden `editedContent` field; publish materializes a client_invoices DRAFT (no
// formData, no routing preview — the invoice gate is the COMPLETED-job eligibility, not an NTE route).

const CATEGORIES = ["labor", "materials", "equipment", "trip", "permit", "fee", "tax", "other"] as const;

type EditableLine = {
  category: string;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  markupPercent: string;
  taxAmount: string;
  reconcilesToVendorLineId: string | null;
  // Phase (ii) Unit 2b — agreed-rate seed/provenance (hidden) + the vendor-cost reference (read-only).
  // suggestedUnitPrice is the override sentinel: provenance is submitted only while unitPrice still
  // equals it. vendorUnitPrice drives the muted "vendor: $X" reference shown beside the price input.
  suggestedUnitPrice: string | null;
  tradeId: string | null;
  rateType: string | null;
  vendorUnitPrice: string | null;
};

function toEditable(lines: ProposedInvoiceLine[]): EditableLine[] {
  return lines.map((l) => ({
    category: l.category,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit ?? null,
    // rate_sheet itemized labor opens at the agreed rate (l.unitPrice already = rate); rate_sheet
    // materials/lumped labor open BLANK ("") for the operator. Still a plain editable input.
    unitPrice: l.unitPrice ?? l.suggestedUnitPrice ?? "",
    markupPercent: l.markupPercent ?? "",
    taxAmount: "0",
    reconcilesToVendorLineId: l.reconcilesToVendorLineId ?? null,
    suggestedUnitPrice: l.suggestedUnitPrice ?? null,
    tradeId: l.tradeId ?? null,
    rateType: l.rateType ?? null,
    vendorUnitPrice: l.vendorUnitPrice ?? null,
  }));
}

// Serialize to resolveEditedInvoice's contract (ProposedInvoice). reconciliation + lumpFlag preserved.
// Phase (ii) Unit 2b: the agreed-rate provenance (tradeId/rateType) is submitted ONLY when the price
// still equals the pre-filled suggestion — a typed-over price is no longer the agreed rate, so its
// provenance is dropped (publish re-verifies server-side regardless). vendorUnitPrice is display-only.
function serialize(lines: EditableLine[], lumpFlag: boolean): string {
  return JSON.stringify({
    lineItems: lines.map((l) => {
      const keptRate = l.suggestedUnitPrice !== null && l.unitPrice === l.suggestedUnitPrice;
      return {
        category: l.category,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        markupPercent: l.markupPercent === "" ? null : l.markupPercent,
        reconcilesToVendorLineId: l.reconcilesToVendorLineId,
        ...(keptRate ? { tradeId: l.tradeId, rateType: l.rateType } : {}),
      };
    }),
    lumpFlag,
  });
}

function InvoiceApproveEditor({ jobId, draft }: { jobId: string; draft: InvoiceDraftDetailed }) {
  const action = approveInvoiceDraftAction.bind(null, jobId, draft.id);
  const [state, formAction, pending] = useActionState<DraftActionState, FormData>(action, null);
  const [lines, setLines] = useState<EditableLine[]>(() => toEditable(draft.proposedInvoice.lineItems));
  const lumpFlag = draft.proposedInvoice.lumpFlag === true;

  const update = (i: number, patch: Partial<EditableLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <form action={formAction}>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Client invoice lines (editable)</p>
      <input type="hidden" name="editedContent" value={serialize(lines, lumpFlag)} />
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
                <input value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} inputMode="decimal" placeholder={l.suggestedUnitPrice === null && l.vendorUnitPrice !== null ? "author price" : undefined} className={inputClass} />
                {l.vendorUnitPrice !== null && (
                  <span className="mt-0.5 block text-[10px] text-neutral-400">vendor: ${l.vendorUnitPrice}</span>
                )}
              </label>
              <label className="text-xs text-neutral-600">
                Markup %
                <input value={l.markupPercent} onChange={(e) => update(i, { markupPercent: e.target.value })} inputMode="decimal" placeholder="(rule default)" className={inputClass} />
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
  );
}

function InvoiceApprovedBody({ jobId, draft }: { jobId: string; draft: InvoiceDraftDetailed }) {
  const action = publishInvoiceDraftAction.bind(null, jobId, draft.id);
  const [state, formAction, pending] = useActionState<DraftActionState, FormData>(action, null);
  return (
    <div>
      <Field label="Client invoice lines">
        <ul className="space-y-1 text-sm text-neutral-800">
          {draft.proposedInvoice.lineItems.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <span className="truncate">{l.category} · {l.description}</span>
              <span className="shrink-0 text-neutral-600">{l.quantity} × ${l.unitPrice}</span>
            </li>
          ))}
        </ul>
      </Field>
      <p className="mt-2 text-xs text-neutral-500">→ Materializes a Client invoice DRAFT (accounting Sends it after).</p>
      <form action={formAction} className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Publishing…" : "Publish to client invoice"}
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

export function InvoiceDraftsSection({ jobId, drafts }: { jobId: string; drafts: InvoiceDraftDetailed[] }) {
  return (
    <AgentDraftsSection<InvoiceDraftDetailed>
      drafts={drafts}
      title="invoice drafts"
      renderEditor={(d) => <InvoiceApproveEditor jobId={jobId} draft={d} />}
      renderApprovedBody={(d) => <InvoiceApprovedBody jobId={jobId} draft={d} />}
      rejectAction={(id) => rejectInvoiceDraftAction.bind(null, jobId, id)}
      discardAction={(id) => discardInvoiceDraftAction.bind(null, jobId, id)}
    />
  );
}
