"use client";

import { useActionState } from "react";
import { archiveClientRateAction, type ClientRateActionState } from "@/app/(app)/clients/[id]/rates/actions";

// ── Phase (i) rate-sheet — rates list + archive ───────────────────────────────────────
// Rows show trade (or "All trades"), rate_type, amount + currency, unit, effective/expiry, status.
// active → Archive. Mirrors billing-rules-list.

const RATE_TYPE_LABEL: Record<string, string> = {
  hourly: "Hourly", per_unit: "Per unit", flat: "Flat",
  trip_charge: "Trip charge", emergency: "Emergency", after_hours: "After hours",
};

export type ClientRateListRow = {
  id: string;
  clientId: string;
  tradeName: string | null;
  rateType: string;
  amount: string;
  currency: string;
  unit: string | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  status: "active" | "inactive" | "archived";
};

type BoundAction = (state: ClientRateActionState, payload: FormData) => Promise<ClientRateActionState>;

function ArchiveButton({ action }: { action: BoundAction }) {
  const [state, formAction, pending] = useActionState<ClientRateActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "…" : "Archive"}
      </button>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

function dateRange(eff: Date | null, exp: Date | null): string {
  if (!eff && !exp) return "";
  const fmt = (d: Date) => d.toLocaleDateString();
  return ` · ${eff ? fmt(eff) : "…"} → ${exp ? fmt(exp) : "…"}`;
}

export function ClientRatesList({ rates }: { rates: ClientRateListRow[] }) {
  if (rates.length === 0) {
    return <p className="text-sm text-neutral-600">No rates for this client yet. Add agreed billed rates below.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
      {rates.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900">
              {r.tradeName ?? "All trades"} · {RATE_TYPE_LABEL[r.rateType] ?? r.rateType}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              ${r.amount} {r.currency}
              {r.unit ? ` / ${r.unit}` : ""}
              {dateRange(r.effectiveDate, r.expiryDate)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
              {r.status}
            </span>
            {r.status === "active" && <ArchiveButton action={archiveClientRateAction.bind(null, r.id, r.clientId)} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
