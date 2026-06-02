"use client";

import { useActionState } from "react";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export type RoutingActionState = { error: string } | null;

type AddAction = (
  prev: RoutingActionState,
  formData: FormData,
) => Promise<RoutingActionState>;

type Option = { id: string; label: string };

export function PreferredVendorForm({
  action,
  vendors,
  trades,
}: {
  action: AddAction;
  vendors: Option[];
  trades: Option[];
}) {
  const [state, formAction, pending] = useActionState<RoutingActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Vendor</span>
          <select name="vendorId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a vendor…
            </option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Trade</span>
          <select name="tradeId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a trade…
            </option>
            {trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Priority <span className="font-normal text-neutral-500">(1 = highest)</span>
          </span>
          <input
            name="priority"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            required
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Notes <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input name="notes" autoComplete="off" className={inputClass} />
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
        {pending ? "Saving…" : "Add preferred vendor"}
      </button>
    </form>
  );
}
