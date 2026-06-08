"use client";

import { useActionState } from "react";
import { setBillingModelAction, type ClientRateActionState } from "@/app/(app)/clients/[id]/rates/actions";

// ── Phase (i) rate-sheet — billing-model selector ─────────────────────────────────────
// Shows + changes how a client is billed. cost_plus (markup on vendor cost) is the default that
// already works end-to-end; rate_sheet bills at the agreed rates (the rate sheet); flat = custom
// per-job amount. Bound to setBillingModelAction (writes clients.billing_model + audit).

const MODELS: { value: string; label: string }[] = [
  { value: "rate_sheet", label: "Rate sheet (agreed billed rates)" },
  { value: "cost_plus", label: "Cost-plus (vendor cost + markup %)" },
  { value: "flat", label: "Flat (custom per job)" },
];

export function BillingModelSelector({ clientId, current }: { clientId: string; current: string }) {
  const action = setBillingModelAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ClientRateActionState, FormData>(action, null);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-neutral-800">Billing model:</span>
      <select
        name="billingModel"
        defaultValue={current}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
      >
        {MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      <span className="text-xs text-neutral-500">how this client is billed</span>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
