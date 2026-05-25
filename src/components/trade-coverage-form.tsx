"use client";

import { useActionState } from "react";
import type { CoverageActionState } from "@/app/(app)/vendors/coverage-actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

type CoverageAction = (
  prev: CoverageActionState,
  formData: FormData,
) => Promise<CoverageActionState>;

export function TradeCoverageForm({
  action,
  trades,
  locations,
}: {
  action: CoverageAction;
  trades: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<CoverageActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Trade</span>
          <select name="tradeId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a trade…
            </option>
            {trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Scope</span>
          <select name="vendorLocationId" defaultValue="" className={inputClass}>
            <option value="">All locations (vendor-wide)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-800">
        <input name="isPrimary" type="checkbox" className="rounded border-neutral-300" />
        Primary trade for this vendor
      </label>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add trade coverage"}
      </button>
    </form>
  );
}
