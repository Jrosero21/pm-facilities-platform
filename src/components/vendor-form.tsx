"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createVendorAction,
  type CreateVendorState,
} from "@/app/(app)/vendors/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function VendorForm() {
  const [state, formAction, pending] = useActionState<CreateVendorState, FormData>(
    createVendorAction,
    null,
  );

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Name</span>
        <input name="name" required autoComplete="off" className={inputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">Vendor type</span>
          <select name="vendorType" defaultValue="local" className={inputClass}>
            <option value="local">Local</option>
            <option value="regional">Regional</option>
            <option value="national">National</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Vendor code <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input
            name="vendorCode"
            autoComplete="off"
            placeholder="e.g. ABC-PHX"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Legal name <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input name="legalName" autoComplete="off" className={inputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Main phone <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input name="mainPhone" autoComplete="off" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Main email <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input name="mainEmail" autoComplete="off" className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Website <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input
            name="website"
            autoComplete="off"
            placeholder="https://"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-800">
            Tax ID / EIN <span className="font-normal text-neutral-500">(optional)</span>
          </span>
          <input name="taxId" autoComplete="off" className={inputClass} />
        </label>
      </div>

      <fieldset className="rounded-md border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-medium text-neutral-800">
          HQ address <span className="font-normal text-neutral-500">(optional)</span>
        </legend>
        <p className="mb-2 text-xs text-neutral-500">
          Fill this to save the vendor&apos;s headquarters now, or leave blank and add locations later.
        </p>
        <label className="block">
          <span className="text-sm text-neutral-700">Address line 1</span>
          <input name="addressLine1" autoComplete="off" className={inputClass} />
        </label>
        <label className="mt-2 block">
          <span className="text-sm text-neutral-700">Address line 2</span>
          <input name="addressLine2" autoComplete="off" className={inputClass} />
        </label>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm text-neutral-700">City</span>
            <input name="city" autoComplete="off" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-700">State / province</span>
            <input name="stateProvince" autoComplete="off" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-700">Postal code</span>
            <input name="postalCode" autoComplete="off" className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm text-neutral-700">Country</span>
            <input name="country" defaultValue="US" maxLength={2} autoComplete="off" className={inputClass} />
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Notes <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <textarea name="notes" rows={3} className={inputClass} />
      </label>

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
          {pending ? "Creating…" : "Create vendor"}
        </button>
        <Link href="/vendors" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}
