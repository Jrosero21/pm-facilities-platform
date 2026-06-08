"use client";

import { useActionState } from "react";
import { createClientRateAction, type ClientRateActionState } from "@/app/(app)/clients/[id]/rates/actions";

// ── Phase (i) rate-sheet — create-rate form ───────────────────────────────────────────
// Per-client per-trade agreed billed rate. Trade optional ("" = all-trades / general). unit is
// meaningful for per_unit (materials). Mirrors billing-rule-form. Storage only — Phase (ii) resolves
// a rate into a billed line.

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

const RATE_TYPES: { value: string; label: string }[] = [
  { value: "hourly", label: "Hourly (labor rate)" },
  { value: "per_unit", label: "Per unit (materials)" },
  { value: "flat", label: "Flat" },
  { value: "trip_charge", label: "Trip charge" },
  { value: "emergency", label: "Emergency" },
  { value: "after_hours", label: "After hours" },
];

type Opt = { id: string; name: string };

export function ClientRateForm({ clientId, trades }: { clientId: string; trades: Opt[] }) {
  const action = createClientRateAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ClientRateActionState, FormData>(action, null);

  return (
    <form action={formAction} className="grid max-w-xl gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-neutral-700">
        Trade
        <select name="tradeId" defaultValue="" className={inputClass}>
          <option value="">All trades / general</option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Rate type
        <select name="rateType" required defaultValue="hourly" className={inputClass}>
          {RATE_TYPES.map((rt) => (
            <option key={rt.value} value={rt.value}>
              {rt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Rate amount
        <input name="amount" required inputMode="decimal" placeholder="e.g. 95.00" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Unit <span className="font-normal text-neutral-500">(optional)</span>
        <input name="unit" placeholder="e.g. hr, each — used for per-unit" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Effective date <span className="font-normal text-neutral-500">(optional)</span>
        <input name="effectiveDate" type="date" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Expiry date <span className="font-normal text-neutral-500">(optional)</span>
        <input name="expiryDate" type="date" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-neutral-700 sm:col-span-2">
        Notes <span className="font-normal text-neutral-500">(optional)</span>
        <textarea name="notes" rows={2} className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add rate"}
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
