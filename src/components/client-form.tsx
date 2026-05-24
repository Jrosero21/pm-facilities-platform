"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createClientAction, type CreateClientState } from "@/app/(app)/clients/actions";

export function ClientForm() {
  const [state, formAction, pending] = useActionState<CreateClientState, FormData>(
    createClientAction,
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-neutral-800">Name</span>
        <input
          name="name"
          required
          autoComplete="off"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-800">
          Client code <span className="font-normal text-neutral-500">(optional)</span>
        </span>
        <input
          name="clientCode"
          autoComplete="off"
          placeholder="e.g. APPLE"
          className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
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
          {pending ? "Creating…" : "Create client"}
        </button>
        <Link href="/clients" className="text-sm text-neutral-600 hover:text-neutral-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}
