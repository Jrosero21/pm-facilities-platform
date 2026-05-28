import Link from "next/link";
import type { ChangeOrderRow } from "@/server/billing/change-orders";

// ── Phase 8 batch 8c.11c — compact change-order list on the job detail (navigable) ────
// Mirrors proposal-list.tsx. COs have a reason (not a title) + no revision concept.

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  withdrawn: "bg-neutral-100 text-neutral-500",
};

function reasonLabel(reason: string | null): string {
  if (!reason) return "Change order";
  return reason.length > 80 ? `${reason.slice(0, 80).trim()}…` : reason;
}

export function ChangeOrderList({ changeOrders, jobId }: { changeOrders: ChangeOrderRow[]; jobId: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-500">{changeOrders.length} total</span>
        <Link
          href={`/jobs/${jobId}/change-orders/new`}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New change order
        </Link>
      </div>

      {changeOrders.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">No change orders yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {changeOrders.map((co) => (
            <li key={co.id}>
              <Link
                href={`/jobs/${jobId}/change-orders/${co.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{reasonLabel(co.reason)}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{co.createdAt.toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium text-neutral-900">${co.total}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[co.status] ?? "bg-neutral-100 text-neutral-700"}`}>
                    {co.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
