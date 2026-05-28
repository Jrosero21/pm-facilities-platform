"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { recordPaymentAction, type PaymentActionState } from "@/app/(app)/jobs/billing-actions";

// ── Phase 8 batch 8c.11e — record-payment form (XOR direction → invoice picker) ───────
// direction toggles which invoice picker shows: inbound (AR) → client invoices (sent); outbound
// (AP) → vendor invoices (approved). Only the active picker's field is submitted; the action reads
// clientInvoiceId iff inbound / vendorInvoiceId iff outbound. Accounting-gated at the action.

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type InvoiceOption = { id: string; label: string };

export function PaymentForm({
  jobId,
  clientInvoices,
  vendorInvoices,
}: {
  jobId: string;
  clientInvoices: InvoiceOption[];
  vendorInvoices: InvoiceOption[];
}) {
  const action = recordPaymentAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(action, null);
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const options = direction === "inbound" ? clientInvoices : vendorInvoices;

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <input type="hidden" name="direction" value={direction} />
      <fieldset>
        <legend className="text-sm font-medium text-neutral-700">Direction</legend>
        <div className="mt-1 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="_direction" checked={direction === "inbound"} onChange={() => setDirection("inbound")} />
            Inbound — client pays us (AR)
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="_direction" checked={direction === "outbound"} onChange={() => setDirection("outbound")} />
            Outbound — we pay a vendor (AP)
          </label>
        </div>
      </fieldset>

      <label className="block text-sm font-medium text-neutral-700">
        {direction === "inbound" ? "Client invoice (sent)" : "Vendor invoice (approved)"}
        {options.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">
            No payable {direction === "inbound" ? "client" : "vendor"} invoices on this job.
          </p>
        ) : (
          <select name={direction === "inbound" ? "clientInvoiceId" : "vendorInvoiceId"} required className={inputClass}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-neutral-700">
          Amount
          <input name="amount" required inputMode="decimal" placeholder="0.00" className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Method
          <input name="method" placeholder="(optional)" className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Reference
          <input name="reference" placeholder="(optional)" className={inputClass} />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || options.length === 0}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record payment"}
        </button>
        <Link href={`/jobs/${jobId}`} className="text-sm text-neutral-500 hover:text-neutral-900">
          Cancel
        </Link>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
