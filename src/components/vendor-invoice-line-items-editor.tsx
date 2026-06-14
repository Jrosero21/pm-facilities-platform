"use client";

import { useActionState } from "react";
import {
  addVendorInvoiceLineItemAction,
  removeVendorInvoiceLineItemAction,
  type VendorInvoiceActionState,
} from "@/app/(app)/jobs/[id]/vendor-invoices/actions";

// ── Phase 8 batch 8c.11d — vendor (AP) line-item editor (add + remove; NO markup) ─────
// Shown only when the invoice is received/under_review (editable). AP lines carry no markup.

const CATEGORIES = ["labor", "materials", "equipment", "trip", "permit", "fee", "tax", "other"] as const;
const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type LineRow = { id: string; lineNumber: number; description: string };

function RemoveLineButton({ lineId, vendorInvoiceId, jobId }: { lineId: string; vendorInvoiceId: string; jobId: string }) {
  const action = removeVendorInvoiceLineItemAction.bind(null, lineId, vendorInvoiceId, jobId) as (
    s: VendorInvoiceActionState,
    p: FormData,
  ) => Promise<VendorInvoiceActionState>;
  const [state, formAction, pending] = useActionState<VendorInvoiceActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button type="submit" disabled={pending} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60">
        {pending ? "Removing…" : "Remove"}
      </button>
      {state?.error && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function VendorInvoiceLineItemsEditor({
  vendorInvoiceId,
  jobId,
  lines,
}: {
  vendorInvoiceId: string;
  jobId: string;
  lines: LineRow[];
}) {
  const addAction = addVendorInvoiceLineItemAction.bind(null, vendorInvoiceId, jobId);
  const [state, formAction, pending] = useActionState<VendorInvoiceActionState, FormData>(addAction, null);

  return (
    <div className="space-y-4">
      {lines.length > 0 && (
        <ul className="space-y-1">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-700">
                #{l.lineNumber} · {l.description}
              </span>
              <RemoveLineButton lineId={l.id} vendorInvoiceId={vendorInvoiceId} jobId={jobId} />
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
          Unit
          <input name="unit" placeholder="hr, hrs, each, lot…" className={inputClass} />
          <span className="mt-1 block text-[11px] font-normal text-neutral-400">
            A time unit (hr/hrs) on a labor line bills the rate-sheet agreed rate.
          </span>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Unit price
          <input name="unitPrice" defaultValue="0" inputMode="decimal" className={inputClass} />
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
