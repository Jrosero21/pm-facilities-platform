"use client";

import { useActionState } from "react";
import { setClientPriorityAction, type ClientPriorityState } from "@/app/(app)/clients/actions";

// Per-client "priority client" flag. Only affects the exceptions ranking when the tenant switch
// (Notifications → Priority-client weighting) is ON. Mirrors RequireVendorInvoiceToggle.
export function PriorityClientToggle({ clientId, current }: { clientId: string; current: boolean }) {
  const action = setClientPriorityAction.bind(null, clientId);
  const [state, formAction, pending] = useActionState<ClientPriorityState, FormData>(action, null);

  return (
    <form action={formAction} className="mt-1 flex flex-wrap items-start gap-2">
      <label className="flex max-w-2xl items-start gap-2">
        <input type="checkbox" name="value" value="true" defaultChecked={current} className="mt-0.5" />
        <span>
          <span className="text-sm font-medium text-neutral-800">Priority client</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            When your tenant has client-priority weighting on, this client&apos;s jobs get a small nudge up the
            needs-attention list. It never overrides an older or more urgent job.
          </span>
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
