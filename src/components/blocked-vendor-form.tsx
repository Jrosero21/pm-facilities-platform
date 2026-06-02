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

export function BlockedVendorForm({
  action,
  vendors,
}: {
  action: AddAction;
  vendors: Option[];
}) {
  const [state, formAction, pending] = useActionState<RoutingActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <span className="text-sm font-medium text-neutral-800">
            Reason <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input
            name="reason"
            autoComplete="off"
            placeholder="e.g. repeated no-shows"
            className={inputClass}
          />
        </label>
      </div>

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
        {pending ? "Saving…" : "Block vendor"}
      </button>
    </form>
  );
}
