"use client";

import { useActionState } from "react";
import {
  approveVendorInvoiceAction,
  disputeVendorInvoiceAction,
  type VendorInvoiceActionState,
} from "@/app/(app)/jobs/[id]/vendor-invoices/actions";

// ── Phase 8 batch 8c.11d — vendor (AP) lifecycle buttons (status-conditioned) ─────────
// received/under_review → Approve (operator commit, OQ-24) / Dispute. approved/disputed/paid →
// terminal here (payment is recorded on the payments UI, 8c.11e). requireTenant-only (no gate).

type BoundAction = (state: VendorInvoiceActionState, payload: FormData) => Promise<VendorInvoiceActionState>;

const VARIANTS = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  danger: "border border-red-300 text-red-700 hover:bg-red-50",
} as const;

function ActionButton({ action, label, pendingLabel, variant }: { action: BoundAction; label: string; pendingLabel: string; variant: keyof typeof VARIANTS }) {
  const [state, formAction, pending] = useActionState<VendorInvoiceActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <button type="submit" disabled={pending} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]}`}>
        {pending ? pendingLabel : label}
      </button>
      {state?.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

export function VendorInvoiceActions({ vendorInvoiceId, jobId, status }: { vendorInvoiceId: string; jobId: string; status: string }) {
  const pendingReview = status === "received" || status === "under_review";
  if (!pendingReview) {
    return <p className="text-sm text-neutral-500">No further actions — this invoice is {status}. (Payments are recorded on the payments screen.)</p>;
  }
  return (
    <div className="flex flex-wrap items-start gap-2">
      <ActionButton action={approveVendorInvoiceAction.bind(null, vendorInvoiceId, jobId)} label="Approve" pendingLabel="Approving…" variant="primary" />
      <ActionButton action={disputeVendorInvoiceAction.bind(null, vendorInvoiceId, jobId)} label="Dispute" pendingLabel="Disputing…" variant="danger" />
    </div>
  );
}
