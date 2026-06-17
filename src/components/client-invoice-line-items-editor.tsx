"use client";

import { useActionState, useState } from "react";
import {
  addClientInvoiceLineItemAction,
  removeClientInvoiceLineItemAction,
  type ClientInvoiceActionState,
} from "@/app/(app)/jobs/[id]/client-invoices/actions";

// Phase (ii) billing-from-rates — the editor's rate-fill affordance (client-safe shape; mirrors the
// server LaborRatePickerContext). enabled only for rate_sheet jobs; absent/disabled = manual pricing.
type RatePickerContext = {
  enabled: boolean;
  defaultTradeId: string | null;
  trades: { id: string; name: string }[];
};

// ── Phase 8 batch 8c.11d — client (AR) line-item editor (markup THREE-WAY) ────────────
// Markup field: BLANK → snapshot the default rule (placeholder shows the resolved default);
// "0" → explicit zero; a value → override (8c.8 Decision 1 / 8c.11d Decision 4). The action maps
// "" → undefined (snapshot); any non-empty → that value.

const CATEGORIES = ["labor", "materials", "equipment", "trip", "permit", "fee", "tax", "other"] as const;
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

// tradeName: the stored trade on agreed-rate labor lines (display-only). Resolved by the page from
// the line's tradeId; null/absent on materials/untraded lines (nothing extra rendered).
type LineRow = { id: string; lineNumber: number; description: string; tradeName?: string | null };

function RemoveLineButton({ lineId, clientInvoiceId, jobId }: { lineId: string; clientInvoiceId: string; jobId: string }) {
  const action = removeClientInvoiceLineItemAction.bind(null, lineId, clientInvoiceId, jobId) as (
    s: ClientInvoiceActionState,
    p: FormData,
  ) => Promise<ClientInvoiceActionState>;
  const [state, formAction, pending] = useActionState<ClientInvoiceActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button type="submit" disabled={pending} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60">
        {pending ? "Removing…" : "Remove"}
      </button>
      {state?.error && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function ClientInvoiceLineItemsEditor({
  clientInvoiceId,
  jobId,
  lines,
  defaultMarkup,
  rateContext,
}: {
  clientInvoiceId: string;
  jobId: string;
  lines: LineRow[];
  defaultMarkup: string | null;
  rateContext?: RatePickerContext;
}) {
  const addAction = addClientInvoiceLineItemAction.bind(null, clientInvoiceId, jobId);
  const [state, formAction, pending] = useActionState<ClientInvoiceActionState, FormData>(addAction, null);
  const markupPlaceholder = defaultMarkup ? `${defaultMarkup} (default)` : "(no default — blank = none)";
  // labor/trip on a rate_sheet job → offer the agreed-rate fill (pick trade, leave price blank).
  const [category, setCategory] = useState("labor");
  const rateEligible = !!rateContext?.enabled && (category === "labor" || category === "trip");

  return (
    <div className="space-y-4">
      {lines.length > 0 && (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-700">
                #{l.lineNumber} · {l.description}
                {l.tradeName && <span className="text-neutral-400"> · {l.tradeName}</span>}
              </span>
              <RemoveLineButton lineId={l.id} clientInvoiceId={clientInvoiceId} jobId={jobId} />
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-neutral-600">
          Category
          <select
            name="category"
            required
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Description
          <input name="description" required className={inputClass} />
        </label>
        {rateEligible && (
          <label className="text-xs font-medium text-neutral-600">
            Trade <span className="font-normal text-neutral-400">— agreed rate</span>
            <select name="tradeId" defaultValue={rateContext?.defaultTradeId ?? ""} className={inputClass}>
              <option value="">— select trade —</option>
              {rateContext?.trades.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-neutral-600">
          Quantity
          <input name="quantity" defaultValue="1" inputMode="decimal" className={inputClass} />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Unit price
          {rateEligible && <span className="font-normal text-neutral-400"> — blank = agreed rate</span>}
          <input
            key={rateEligible ? "rate" : "manual"}
            name="unitPrice"
            defaultValue={rateEligible ? "" : "0"}
            placeholder={rateEligible ? "agreed rate" : undefined}
            inputMode="decimal"
            className={inputClass}
          />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Markup %{" "}
          <span className="font-normal text-neutral-400">— blank = default, 0 = none</span>
          <input name="markupPercent" inputMode="decimal" placeholder={markupPlaceholder} className={inputClass} />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Tax amount
          <input name="taxAmount" defaultValue="0" inputMode="decimal" className={inputClass} />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add line item"}
          </button>
          {state?.error && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
