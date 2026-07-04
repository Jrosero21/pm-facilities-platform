"use client";

import { useActionState } from "react";
import Link from "next/link";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

// Shared action-state contract for the location form. Owned here (the neutral,
// domain-agnostic component) so any domain's location action — client, vendor,
// and beyond — can conform without importing from another domain's folder.
export type LocationActionState = { error: string } | null;

type LocationAction = (
  prev: LocationActionState,
  formData: FormData,
) => Promise<LocationActionState>;

export type LocationDefaults = {
  name?: string;
  locationCode?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  stateProvince?: string;
  postalCode?: string;
  country?: string;
};

export function LocationForm({
  action,
  cancelHref,
  defaults,
  submitLabel = "Create location",
}: {
  // Bind the parent id(s) into the action before passing it in, e.g.
  // createLocationAction.bind(null, clientId) or updateLocationAction.bind(null, clientId, locationId).
  action: LocationAction;
  cancelHref: string;
  // When provided, the form is an EDIT (fields prefilled). Absent → a create (empty).
  defaults?: LocationDefaults;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<LocationActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Location name</span>
        <input name="name" required autoComplete="off" defaultValue={defaults?.name ?? ""} className={inputClass} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Location code <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input name="locationCode" autoComplete="off" placeholder="store #" defaultValue={defaults?.locationCode ?? ""} className={inputClass} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Address line 1</span>
        <input name="addressLine1" required autoComplete="off" defaultValue={defaults?.addressLine1 ?? ""} className={inputClass} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Address line 2 <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input name="addressLine2" autoComplete="off" defaultValue={defaults?.addressLine2 ?? ""} className={inputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">City</span>
          <input name="city" required autoComplete="off" defaultValue={defaults?.city ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">State / province</span>
          <input name="stateProvince" required autoComplete="off" defaultValue={defaults?.stateProvince ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Postal code</span>
          <input name="postalCode" required autoComplete="off" defaultValue={defaults?.postalCode ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Country</span>
          <input
            name="country"
            defaultValue={defaults?.country ?? "US"}
            maxLength={2}
            autoComplete="off"
            className={inputClass}
          />
        </label>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
