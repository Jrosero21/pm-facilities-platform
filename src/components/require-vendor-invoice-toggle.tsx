"use client";

import { useActionState } from "react";
import {
  setRequireVendorInvoiceForCostPlusAction,
  type ClientRateActionState,
} from "@/app/(app)/clients/[id]/rates/actions";

// ── Phase (iii) Part 2 — "require vendor invoice for cost-plus billing" toggle ─────────
// A per-client ADVISORY preference. When ON, Part 3 reminds the operator at cost-plus invoice issuance
// if no vendor-invoice document is attached. It NEVER blocks billing (the helper text says so). Shown
// for every client (the setting is durable across billing-model changes); the copy frames it as
// cost-plus-specific. Mirrors BillingModelSelector (checkbox + Update, bound to the writer action).

export function RequireVendorInvoiceToggle({ clientId, current }: { clientId: string; current: boolean }) {
  const action = setRequireVendorInvoiceForCostPlusAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ClientRateActionState, FormData>(action, null);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-start gap-2">
      <label className="flex max-w-2xl items-start gap-2">
        <input type="checkbox" name="value" value="true" defaultChecked={current} className="mt-0.5" />
        <span>
          <span className="text-sm font-medium text-neutral-800">Require vendor invoice for cost-plus billing</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            When on, you&apos;ll be reminded if the vendor invoice document isn&apos;t attached when billing this
            client cost-plus. You can always proceed anyway — it never blocks billing.
          </span>
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
