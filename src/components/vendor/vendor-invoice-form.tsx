"use client";

import { useActionState, useState } from "react";
import { submitVendorInvoiceAction } from "@/app/(vendor)/vendor/jobs/[id]/invoices/new/actions";

type ActionState = { error?: string } | null;

type LineRow = {
  category: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

// Mirrors vendor_invoice_line_items.category enum (10n-inspect Step 3).
const CATEGORY_OPTIONS = [
  "labor",
  "materials",
  "equipment",
  "trip",
  "permit",
  "fee",
  "tax",
  "other",
] as const;

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

function emptyRow(): LineRow {
  return { category: "labor", description: "", quantity: "1", unit: "", unitPrice: "" };
}

/**
 * Vendor invoice submission form. Header fields (invoice number, date, notes)
 * optional; a dynamic line-item table is required (>=1 row, DoR-10n.3).
 *
 * Line-item rows live in client state; each field renders as
 * <input name="lineItems[N].field"> so the server action parses them from
 * FormData. Totals are NOT previewed — recordVendorInvoice computes them
 * server-side (writer-owned); a client-side Big.js preview is out of MVP scope.
 *
 * Phase 10 batch 10n-construct.
 */
export function VendorInvoiceForm({ assignmentId }: { assignmentId: string }) {
  const [rows, setRows] = useState<LineRow[]>([emptyRow()]);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    submitVendorInvoiceAction.bind(null, assignmentId),
    null,
  );

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx: number, field: keyof LineRow, value: string) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Invoice number (optional)
          </label>
          <input type="text" name="invoiceNumber" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Invoice date (optional)
          </label>
          <input type="date" name="invoiceDate" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Notes (optional)
        </label>
        <textarea name="notes" rows={2} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Line items
        </label>
        <p className="mt-1 text-xs text-neutral-500">
          Totals are calculated automatically after submission.
        </p>
        <div className="mt-3 space-y-3">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3"
            >
              <div className="col-span-3">
                <label className="block text-xs text-neutral-600">Category</label>
                <select
                  name={`lineItems[${idx}].category`}
                  value={row.category}
                  onChange={(e) => updateRow(idx, "category", e.target.value)}
                  className={inputClass}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <label className="block text-xs text-neutral-600">Description</label>
                <input
                  type="text"
                  name={`lineItems[${idx}].description`}
                  value={row.description}
                  onChange={(e) => updateRow(idx, "description", e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-neutral-600">Qty</label>
                <input
                  type="number"
                  step="0.01"
                  name={`lineItems[${idx}].quantity`}
                  value={row.quantity}
                  onChange={(e) => updateRow(idx, "quantity", e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs text-neutral-600">Unit</label>
                <input
                  type="text"
                  name={`lineItems[${idx}].unit`}
                  value={row.unit}
                  onChange={(e) => updateRow(idx, "unit", e.target.value)}
                  placeholder="hr"
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-neutral-600">Unit price</label>
                <input
                  type="number"
                  step="0.01"
                  name={`lineItems[${idx}].unitPrice`}
                  value={row.unitPrice}
                  onChange={(e) => updateRow(idx, "unitPrice", e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <div className="col-span-1 flex items-end">
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-3 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          + Add line item
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit invoice"}
        </button>
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
