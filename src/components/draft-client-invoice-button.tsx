"use client";

import { useActionState } from "react";
import { generateInvoiceAction, type InvoiceActionState } from "@/app/(app)/jobs/invoice-actions";

// PER-VENDOR-INVOICE trigger: the invoice agent drafts the client invoice FROM a specific vendor
// invoice, so the trigger lives per row in the Vendor invoices (AP) list (unlike the per-job scope /
// proposal buttons). The draftable-status PREDICATE (canDraftClientInvoice) is a pure util in
// @/server/billing/vendor-invoice-status — it must NOT live here, because a "use client" export is a
// client reference the SERVER vendor-invoice list cannot invoke.
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
