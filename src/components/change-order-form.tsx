"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createChangeOrderAction, type ChangeOrderActionState } from "@/app/(app)/jobs/[id]/change-orders/actions";

// ── Phase 8 batch 8c.11c — create-change-order header form ────────────────────────────
// Creates a draft (header only); line items are added on the detail screen after create
// (createChangeOrderAction redirects there). A CO has a reason + scope-delta (not a title).

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function ChangeOrderForm({ jobId }: { jobId: string }) {
  const action = createChangeOrderAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<ChangeOrderActionState, FormData>(action, null);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <label className="block text-sm font-medium text-neutral-700">
        Reason
        <textarea name="reason" rows={3} placeholder="Why is this change needed?" className={inputClass} />
      </label>
      <label className="block text-sm font-medium text-neutral-700">
        Scope delta
        <textarea name="scopeDeltaSnapshot" rows={4} placeholder="What changes (added/removed work)?" className={inputClass} />
      </label>
      <label className="block text-sm font-medium text-neutral-700 sm:max-w-[12rem]">
        Currency
        <input name="currency" defaultValue="USD" maxLength={3} className={inputClass} />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create change order"}
        </button>
        <Link href={`/jobs/${jobId}`} className="text-sm text-neutral-500 hover:text-neutral-900">
          Cancel
        </Link>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
