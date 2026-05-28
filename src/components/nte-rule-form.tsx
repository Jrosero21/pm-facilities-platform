"use client";

import { useActionState } from "react";
import { createClientNteRuleAction, type NteRuleActionState } from "@/app/(app)/clients/[id]/nte-rules/actions";

// ── Phase 8 batch 8c.11e — create-NTE-rule form ───────────────────────────────────────
// A rule governs (client × trade × priority [× location]). Location optional → "Client-wide".
// Creating an active rule supersedes any prior active for the same tuple (data layer demotes it).

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type Opt = { id: string; name: string };

export function NteRuleForm({
  clientId,
  trades,
  priorities,
  locations,
}: {
  clientId: string;
  trades: Opt[];
  priorities: Opt[];
  locations: Opt[];
}) {
  const action = createClientNteRuleAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<NteRuleActionState, FormData>(action, null);

  return (
    <form action={formAction} className="grid max-w-xl gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-neutral-700">
        Trade
        <select name="tradeId" required className={inputClass}>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Priority
        <select name="priorityId" required className={inputClass}>
          {priorities.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Location
        <select name="clientLocationId" className={inputClass} defaultValue="">
          <option value="">Client-wide (all locations)</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-neutral-700">
        NTE amount
        <input name="nteAmount" required inputMode="decimal" placeholder="0.00" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-neutral-700">
        Currency
        <input name="currency" defaultValue="USD" maxLength={3} className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create NTE rule"}
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
