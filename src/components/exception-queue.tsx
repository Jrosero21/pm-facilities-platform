import Link from "next/link";
import type { Exception } from "@/server/analytics/exceptions";

// Phase 19e — the exception queue (the "manage by exception" feed). Display-only: a flat
// sorted list over getExceptions, one row per Exception kind. No interactivity → a Server
// Component (no "use client"). Mirrors VendorUpdatesInbox's row markup. The list is already
// sorted by sortKey (elapsed seconds) DESC upstream; we render in order.

const KIND_META: Record<Exception["kind"], { label: string; badge: string }> = {
  vendor_not_accepted: { label: "Vendor not accepted", badge: "bg-amber-100 text-amber-800" },
  nte_increase_requested: { label: "NTE increase requested", badge: "bg-blue-100 text-blue-800" },
  operational: { label: "Operational", badge: "bg-neutral-100 text-neutral-700" },
};

// Humanize an elapsed-seconds count into a compact age ("6h", "2d", "45m").
function humanizeAge(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function truncate(s: string, n = 120): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function ExceptionQueue({ items }: { items: Exception[] }) {
  return (
    <div className="mt-6 space-y-2">
      {items.map((item) => (
        <ExceptionRow key={rowKey(item)} item={item} />
      ))}
    </div>
  );
}

function rowKey(item: Exception): string {
  switch (item.kind) {
    case "vendor_not_accepted":
      return `va_${item.assignmentId}`;
    case "nte_increase_requested":
      return `nte_${item.changeOrderId}`;
    case "operational":
      return `op_${item.jobId}`;
  }
}

function ExceptionRow({ item }: { item: Exception }) {
  const meta = KIND_META[item.kind];
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
        <Link
          href={`/jobs/${item.jobId}`}
          className="text-xs font-medium text-neutral-700 hover:underline"
        >
          #{item.jobNumber} · {item.clientName}
        </Link>
        <span className="text-xs text-neutral-500">{humanizeAge(item.sortKey)}</span>
      </div>
      <Detail item={item} />
    </div>
  );
}

function Detail({ item }: { item: Exception }) {
  switch (item.kind) {
    case "vendor_not_accepted":
      return (
        <p className="text-sm text-neutral-800">
          {item.vendorName} has not accepted the dispatch ({humanizeAge(item.ageSeconds)} since sent).
        </p>
      );
    case "nte_increase_requested":
      return (
        <p className="text-sm text-neutral-800">
          Change order for <span className="font-medium">${item.total}</span> awaiting approval
          {item.reason ? ` — ${truncate(item.reason)}` : ""}.
        </p>
      );
    case "operational": {
      const tierLabel: Record<string, string> = {
        stalled: "Stalled",
        overdue: "Overdue",
        "unassigned-high-priority": "Unassigned high-priority",
        aged: "Aged",
      };
      return (
        <p className="text-sm text-neutral-800">
          {tierLabel[item.urgencyTier] ?? item.urgencyTier} —{" "}
          {humanizeAge(item.ageInCurrentStatusSeconds)} in current status.
        </p>
      );
    }
  }
}
