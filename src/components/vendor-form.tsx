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
