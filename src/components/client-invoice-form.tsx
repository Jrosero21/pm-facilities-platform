"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createClientInvoiceAction, type ClientInvoiceActionState } from "@/app/(app)/jobs/[id]/client-invoices/actions";

// ── Phase 8 batch 8c.11d — create-client-invoice form ─────────────────────────────────
// clientId is the job's client (hidden); the operator authors the draft (line items + send come
// after). requireTenant-only at the action; SEND is the accounting-gated step (on the detail).

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function ClientInvoiceForm({ jobId, clientId }: { jobId: string; clientId: string }) {
  const action = createClientInvoiceAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<ClientInvoiceActionState, FormData>(action, null);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">
          Invoice number
          <input name="invoiceNumber" placeholder="(optional)" className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Currency
          <input name="currency" defaultValue="USD" maxLength={3} className={inputClass} />
        </label>
      </div>
      <label className="block text-sm font-medium text-neutral-700 sm:max-w-[14rem]">
        Due date
        <input name="dueAt" type="date" className={inputClass} />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create invoice"}
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
