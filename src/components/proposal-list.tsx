import Link from "next/link";
import type { ProposalRow } from "@/server/billing/proposals";

// ── Phase 8 batch 8c.11b — compact proposal list on the job detail (navigable) ────────
// Makes the 11a billing "Proposals N" count navigable. Server component; links to the detail
// route. Flat chronological list (chain-grouping of revisions is a future polish).

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-indigo-100 text-indigo-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  withdrawn: "bg-neutral-100 text-neutral-500",
  expired: "bg-amber-100 text-amber-700",
  superseded: "bg-neutral-100 text-neutral-500",
};

export function ProposalList({ proposals, jobId }: { proposals: ProposalRow[]; jobId: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-500">{proposals.length} total</span>
        <Link
          href={`/jobs/${jobId}/proposals/new`}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New proposal
        </Link>
      </div>

      {proposals.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">No proposals yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {proposals.map((p) => (
            <li key={p.id}>
              <Link
                href={`/jobs/${jobId}/proposals/${p.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {p.title ?? "Untitled proposal"}
                    {p.revisionNumber > 1 && (
                      <span className="ml-2 text-xs font-normal text-neutral-500">rev {p.revisionNumber}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{p.createdAt.toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium text-neutral-900">${p.total}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status] ?? "bg-neutral-100 text-neutral-700"}`}>
                    {p.status}
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
