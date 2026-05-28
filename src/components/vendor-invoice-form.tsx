"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { recordVendorInvoiceAction, type VendorInvoiceActionState } from "@/app/(app)/jobs/[id]/vendor-invoices/actions";

// ── Phase 8 batch 8c.11d — record-vendor-invoice form (assignment-anchored, CF-8c.11d.1) ──
// The operator records an AP invoice against an existing dispatch (job_vendor_assignments). The
// selected assignment supplies vendorId + assignmentId (hidden). No free vendor picker (deferred).
// Line items are added on the detail screen after create.

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type Assignment = { id: string; vendorId: string; vendorName: string; statusName: string };

export function VendorInvoiceForm({ jobId, assignments }: { jobId: string; assignments: Assignment[] }) {
  const action = recordVendorInvoiceAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<VendorInvoiceActionState, FormData>(action, null);
  const [selId, setSelId] = useState(assignments[0]?.id ?? "");
  const sel = assignments.find((a) => a.id === selId);

  if (assignments.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        No dispatches on this job yet. Dispatch a vendor first, then record its invoice.{" "}
        <Link href={`/jobs/${jobId}/dispatch/new`} className="font-medium text-neutral-900 hover:underline">
          New dispatch
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <label className="block text-sm font-medium text-neutral-700">
        Dispatch (vendor)
        <select value={selId} onChange={(e) => setSelId(e.target.value)} className={inputClass}>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.vendorName} · {a.statusName}
            </option>
          ))}
        </select>
      </label>
      <input type="hidden" name="vendorId" value={sel?.vendorId ?? ""} />
      <input type="hidden" name="assignmentId" value={sel?.id ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">
          Invoice number
          <input name="invoiceNumber" placeholder="(optional)" className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Invoice date
          <input name="invoiceDate" type="date" className={inputClass} />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Recording…" : "Record invoice"}
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
