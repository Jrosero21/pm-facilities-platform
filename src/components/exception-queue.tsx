import Link from "next/link";
import type { Exception } from "@/server/analytics/exceptions";
import { FOLLOW_UP_CATEGORY_LABELS } from "@/lib/follow-up";
import { SuggestReplacementButton } from "@/components/suggest-replacement-button";

// Phase 19e — the exception queue (the "manage by exception" feed). Display-only: a flat
// sorted list over getExceptions, one row per Exception kind. No interactivity → a Server
// Component (no "use client"). Mirrors VendorUpdatesInbox's row markup. The list is already
// sorted by sortKey (elapsed seconds) DESC upstream; we render in order.

const KIND_META: Record<Exception["kind"], { label: string; badge: string }> = {
  vendor_not_accepted: { label: "Vendor not accepted", badge: "bg-amber-100 text-amber-800" },
  nte_increase_requested: { label: "NTE increase requested", badge: "bg-blue-100 text-blue-800" },
  operational: { label: "Operational", badge: "bg-neutral-100 text-neutral-700" },
  follow_up_overdue: { label: "Follow-up due", badge: "bg-purple-100 text-purple-800" },
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

// True elapsed age for display. sortKey can carry a "stuck" bump (CF-19.1a), so it is NOT the
// real age for a bumped (stuck) vendor_not_accepted row — use the kind's explicit age field.
// Kinds without an explicit age field are never bumped, so their sortKey == true age.
function trueAgeSeconds(item: Exception): number {
  switch (item.kind) {
    case "vendor_not_accepted":
      return item.ageSeconds;
    case "operational":
      return item.ageInCurrentStatusSeconds;
    case "nte_increase_requested":
    case "follow_up_overdue":
      return item.sortKey;
  }
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
    case "follow_up_overdue":
      return `fu_${item.jobId}`;
  }
}

function ExceptionRow({ item }: { item: Exception }) {
  const meta = KIND_META[item.kind];
  const stuck = item.kind === "vendor_not_accepted" && item.isStuck;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${meta.badge}`}>{meta.label}</span>
        {stuck ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Stuck</span>
        ) : null}
        <Link
          href={`/jobs/${item.jobId}`}
          className="text-xs font-medium text-neutral-700 hover:underline"
        >
          #{item.jobNumber} · {item.clientName}
        </Link>
        <span className="text-xs text-neutral-500">{humanizeAge(trueAgeSeconds(item))}</span>
      </div>
      <Detail item={item} />
      {item.kind === "vendor_not_accepted" && item.redispatchState != null && (
        <div className="mt-2">
          {item.redispatchState === "can_suggest" && (
            <SuggestReplacementButton jobId={item.jobId} stuckAssignmentId={item.assignmentId} />
          )}
          {item.redispatchState === "suggestion_ready" && item.suggestion && (
            <Link
              href={`/jobs/${item.jobId}/dispatch/${item.suggestion.draftId}`}
              className="inline-block rounded bg-blue-50 px-2 py-1 text-sm font-medium text-neutral-900 hover:underline"
            >
              Replacement ready: {item.suggestion.draftVendorName} — review &amp; approve
            </Link>
          )}
          {item.redispatchState === "exhausted_max_attempts" && (
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-sm font-medium text-red-800">
              Out of attempts — needs manual attention.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ item }: { item: Exception }) {
  switch (item.kind) {
    case "vendor_not_accepted":
      return (
        <p className="text-sm text-neutral-800">
          {item.vendorName} has not accepted the dispatch ({humanizeAge(item.ageSeconds)} since sent)
          {item.isStuck && item.thresholdSeconds != null
            ? ` — past the ${humanizeAge(item.thresholdSeconds)} threshold.`
            : "."}
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
    case "follow_up_overdue": {
      const cat = item.category ? FOLLOW_UP_CATEGORY_LABELS[item.category] : null;
      return (
        <p className="text-sm text-neutral-800">
          Follow-up{cat ? ` (${cat})` : ""} was due {humanizeAge(item.sortKey)} ago.
        </p>
      );
    }
  }
}
