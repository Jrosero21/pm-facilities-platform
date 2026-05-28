"use client";

import { useActionState } from "react";
import {
  addClientInvoiceLineItemAction,
  removeClientInvoiceLineItemAction,
  type ClientInvoiceActionState,
} from "@/app/(app)/jobs/[id]/client-invoices/actions";

// ── Phase 8 batch 8c.11d — client (AR) line-item editor (markup THREE-WAY) ────────────
// Markup field: BLANK → snapshot the default rule (placeholder shows the resolved default);
// "0" → explicit zero; a value → override (8c.8 Decision 1 / 8c.11d Decision 4). The action maps
// "" → undefined (snapshot); any non-empty → that value.

const CATEGORIES = ["labor", "materials", "equipment", "trip", "permit", "fee", "tax", "other"] as const;
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type LineRow = { id: string; lineNumber: number; description: string };

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
}: {
  clientInvoiceId: string;
  jobId: string;
  lines: LineRow[];
  defaultMarkup: string | null;
}) {
  const addAction = addClientInvoiceLineItemAction.bind(null, clientInvoiceId, jobId);
  const [state, formAction, pending] = useActionState<ClientInvoiceActionState, FormData>(addAction, null);
  const markupPlaceholder = defaultMarkup ? `${defaultMarkup} (default)` : "(no default — blank = none)";

  return (
    <div className="space-y-4">
      {lines.length > 0 && (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-700">
                #{l.lineNumber} · {l.description}
              </span>
              <RemoveLineButton lineId={l.id} clientInvoiceId={clientInvoiceId} jobId={jobId} />
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-neutral-600">
          Category
          <select name="category" required className={inputClass} defaultValue="labor">
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
        <label className="text-xs font-medium text-neutral-600">
          Quantity
          <input name="quantity" defaultValue="1" inputMode="decimal" className={inputClass} />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Unit price
          <input name="unitPrice" defaultValue="0" inputMode="decimal" className={inputClass} />
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
