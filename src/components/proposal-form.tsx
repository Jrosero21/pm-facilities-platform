"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createProposalAction, type ProposalActionState } from "@/app/(app)/jobs/[id]/proposals/actions";

// ── Phase 8 batch 8c.11b — create-proposal header form ────────────────────────────────
// Creates a draft (header only); the operator adds line items on the detail screen after create
// (createProposalAction redirects there on success).

const inputClass =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900";

export function ProposalForm({ jobId }: { jobId: string }) {
  const action = createProposalAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState<ProposalActionState, FormData>(action, null);

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <label className="block text-sm font-medium text-neutral-700">
        Title
        <input name="title" placeholder="(optional)" className={inputClass} />
      </label>
      <label className="block text-sm font-medium text-neutral-700">
        Scope snapshot
        <textarea name="scopeSnapshot" rows={4} placeholder="(optional)" className={inputClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">
          Currency
          <input name="currency" defaultValue="USD" maxLength={3} className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-neutral-700">
          Valid until
          <input name="validUntil" type="date" className={inputClass} />
        </label>
      </div>
      <label className="block text-sm font-medium text-neutral-700">
        Notes
        <textarea name="notes" rows={2} placeholder="(optional)" className={inputClass} />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create proposal"}
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
