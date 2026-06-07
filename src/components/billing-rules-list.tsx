"use client";

import { useActionState } from "react";
import {
  archiveClientBillingRuleAction,
  setDefaultClientBillingRuleAction,
  type BillingRuleActionState,
} from "@/app/(app)/clients/[id]/billing-rules/actions";

// ── CF-27.7 Seam 0 — billing-rules list + set-default/archive ─────────────────────────
// Rows show name + markup % + payment terms + status, with a "Default" badge on the resolved row
// (is_default + active). active non-default → "Set default"; active → "Archive". Mirrors nte-rules-list.

export type BillingRuleListRow = {
  id: string;
  clientId: string;
  name: string;
  markupPercent: string | null;
  paymentTermsDays: number | null;
  isDefault: boolean;
  status: "active" | "inactive" | "archived";
};

type BoundAction = (state: BillingRuleActionState, payload: FormData) => Promise<BillingRuleActionState>;

function RowButton({ action, label, danger }: { action: BoundAction; label: string; danger?: boolean }) {
  const [state, formAction, pending] = useActionState<BillingRuleActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-1 text-xs font-medium disabled:opacity-60 ${
          danger ? "border border-red-300 text-red-700 hover:bg-red-50" : "bg-neutral-900 text-white hover:bg-neutral-800"
        }`}
      >
        {pending ? "…" : label}
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function BillingRulesList({ rules }: { rules: BillingRuleListRow[] }) {
  if (rules.length === 0) {
    return <p className="text-sm text-neutral-600">No billing rules for this client yet. Add one below to set the markup.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
      {rules.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
              {r.name}
              {r.isDefault && r.status === "active" && (
                <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Default</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {r.markupPercent != null ? `${r.markupPercent}% markup` : "no markup"}
              {r.paymentTermsDays != null ? ` · net ${r.paymentTermsDays}d` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
              {r.status}
            </span>
            {r.status === "active" && !r.isDefault && (
              <RowButton action={setDefaultClientBillingRuleAction.bind(null, r.id, r.clientId)} label="Set default" />
            )}
            {r.status === "active" && (
              <RowButton action={archiveClientBillingRuleAction.bind(null, r.id, r.clientId)} label="Archive" danger />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
