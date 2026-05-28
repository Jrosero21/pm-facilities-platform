"use client";

import { useActionState } from "react";
import {
  sendClientInvoiceAction,
  voidClientInvoiceAction,
  type ClientInvoiceActionState,
} from "@/app/(app)/jobs/[id]/client-invoices/actions";

// ── Phase 8 batch 8c.11d — client (AR) lifecycle buttons — ACCOUNTING-GATED ───────────
// Send (draft→sent) + Void (sent→void) are accounting-gated at the action (enforceAccountingGate).
// Defense-in-depth: the buttons render only when `canAccount` (the viewer is accounting/super);
// non-accounting users see a hint, never a button that would redirect. The action stays the backstop.

type BoundAction = (state: ClientInvoiceActionState, payload: FormData) => Promise<ClientInvoiceActionState>;

const VARIANTS = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  danger: "border border-red-300 text-red-700 hover:bg-red-50",
} as const;

function ActionButton({ action, label, pendingLabel, variant }: { action: BoundAction; label: string; pendingLabel: string; variant: keyof typeof VARIANTS }) {
  const [state, formAction, pending] = useActionState<ClientInvoiceActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <button type="submit" disabled={pending} className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]}`}>
        {pending ? pendingLabel : label}
      </button>
      {state?.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

export function ClientInvoiceActions({
  clientInvoiceId,
  jobId,
  status,
  canAccount,
}: {
  clientInvoiceId: string;
  jobId: string;
  status: string;
  canAccount: boolean;
}) {
  if (status === "void") {
    return <p className="text-sm text-neutral-500">This invoice is void.</p>;
  }
  const isDraft = status === "draft";
  const isSent = status === "sent";

  if (!canAccount) {
    return (
      <p className="text-sm text-neutral-500">
        {isDraft ? "Issuing this invoice requires the accounting role." : "Voiding this invoice requires the accounting role."}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {isDraft && (
        <ActionButton action={sendClientInvoiceAction.bind(null, clientInvoiceId, jobId)} label="Send (issue)" pendingLabel="Sending…" variant="primary" />
      )}
      {isSent && (
        <ActionButton action={voidClientInvoiceAction.bind(null, clientInvoiceId, jobId)} label="Void" pendingLabel="Voiding…" variant="danger" />
      )}
    </div>
  );
}
