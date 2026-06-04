"use client";

import { useActionState } from "react";
import { generateInvoiceAction, type InvoiceActionState } from "@/app/(app)/jobs/invoice-actions";

// PER-VENDOR-INVOICE trigger: the invoice agent drafts the client invoice FROM a specific vendor
// invoice, so the trigger lives per row in the Vendor invoices (AP) list (unlike the per-job scope /
// proposal buttons). Gated on a vendor invoice the vendor has submitted (status received / under_review
// / approved) — NOT a disputed/paid one. The server action is the authoritative gate (it surfaces
// JOB_NOT_COMPLETED / VENDOR_INVOICE_NOT_FOUND); this is a courteous UI pre-filter.
const DRAFTABLE_VENDOR_INVOICE_STATUSES = new Set(["received", "under_review", "approved"]);

export function canDraftClientInvoice(vendorInvoiceStatus: string): boolean {
  return DRAFTABLE_VENDOR_INVOICE_STATUSES.has(vendorInvoiceStatus);
}

export function DraftClientInvoiceButton({ jobId, vendorInvoiceId }: { jobId: string; vendorInvoiceId: string }) {
  const action = generateInvoiceAction.bind(null, jobId, vendorInvoiceId);
  const [state, formAction, pending] = useActionState<InvoiceActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Drafting…" : "Draft client invoice"}
      </button>
      {state?.error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
