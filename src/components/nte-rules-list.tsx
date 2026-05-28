"use client";

import { useActionState } from "react";
import {
  activateClientNteRuleAction,
  archiveClientNteRuleAction,
  type NteRuleActionState,
} from "@/app/(app)/clients/[id]/nte-rules/actions";

// ── Phase 8 batch 8c.11e — NTE-rules list + activate/archive ──────────────────────────
// Rows are enriched by the page with display names + the raw tuple (the activate action needs the
// full client×trade×priority[×location] tuple). active rows → Archive; archived → Activate.

export type NteRuleListRow = {
  id: string;
  clientId: string;
  tradeId: string;
  priorityId: string;
  clientLocationId: string | null;
  tradeName: string;
  priorityName: string;
  locationName: string;
  nteAmount: string;
  currency: string;
  status: "active" | "archived";
};

type BoundAction = (state: NteRuleActionState, payload: FormData) => Promise<NteRuleActionState>;

function RowButton({ action, label, pendingLabel, danger }: { action: BoundAction; label: string; pendingLabel: string; danger?: boolean }) {
  const [state, formAction, pending] = useActionState<NteRuleActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-1 text-xs font-medium disabled:opacity-60 ${
          danger ? "border border-red-300 text-red-700 hover:bg-red-50" : "bg-neutral-900 text-white hover:bg-neutral-800"
        }`}
      >
        {pending ? pendingLabel : label}
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function NteRulesList({ rules }: { rules: NteRuleListRow[] }) {
  if (rules.length === 0) {
    return <p className="text-sm text-neutral-600">No NTE rules for this client yet.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
      {rules.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              {r.tradeName} · {r.priorityName} · {r.locationName}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              ${r.nteAmount} {r.currency}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
              {r.status}
            </span>
            {r.status === "active" ? (
              <RowButton action={archiveClientNteRuleAction.bind(null, r.id, r.clientId)} label="Archive" pendingLabel="…" danger />
            ) : (
              <RowButton
                action={activateClientNteRuleAction.bind(null, r.id, r.clientId, r.tradeId, r.priorityId, r.clientLocationId)}
                label="Activate"
                pendingLabel="…"
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
