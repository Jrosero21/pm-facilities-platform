"use client";

import { useActionState } from "react";
import { createClientBillingRuleAction, type BillingRuleActionState } from "@/app/(app)/clients/[id]/billing-rules/actions";

// ── CF-27.7 Seam 0 — create-billing-rule form ─────────────────────────────────────────
// A rule is per-client (no trade/priority/location, unlike NTE). markup_percent is the core field —
// it's what resolveClientMarkupDefault snapshots onto proposal/invoice lines (the cost-plus path).
// is_default defaults CHECKED (the first rule should be the resolved default). tax-exempt + emergency
// multiplier are optional bundled billing-config fields.

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function BillingRuleForm({ clientId }: { clientId: string }) {
  const action = createClientBillingRuleAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<BillingRuleActionState, FormData>(action, null);

  return (
    <form action={formAction} className="grid max-w-xl gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-neutral-700 sm:col-span-2">
        Name
        <input name="name" required placeholder="e.g. Standard markup" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Markup % on cost
        <input name="markupPercent" required inputMode="decimal" placeholder="e.g. 18.000" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Payment terms (days) <span className="font-normal text-neutral-500">(optional)</span>
        <input name="paymentTermsDays" inputMode="numeric" placeholder="e.g. 30" className={inputClass} />
      </label>

      <div className="sm:col-span-2 rounded-md border border-neutral-200 bg-white p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Optional</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="isTaxExempt" />
            Tax-exempt client
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Emergency NTE multiplier
            <input name="emergencyNteMultiplier" inputMode="decimal" placeholder="e.g. 1.50" className={inputClass} />
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 sm:col-span-2">
        <input type="checkbox" name="isDefault" defaultChecked />
        Make this the client&apos;s default billing rule
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create billing rule"}
        </button>
        {state?.error && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
