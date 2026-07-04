"use client";

import { useActionState } from "react";
import { setTenantPriorityWeightingAction, type TenantWeightingState } from "@/app/(app)/notifications/actions";

// The tenant-wide client-priority weighting switch (tenant_admin-gated at the action). OFF by default;
// when ON, clients flagged "priority" get a small triage nudge. Mirrors RequireVendorInvoiceToggle.
export function PriorityWeightingToggle({ current }: { current: boolean }) {
  const [state, formAction, pending] = useActionState<TenantWeightingState, FormData>(setTenantPriorityWeightingAction, null);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="value" value="true" defaultChecked={current} />
        <span className="text-xs font-medium text-neutral-700">Priority-client weighting</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-60"
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
