// ── Phase 9 batch 9e — Aggregator operational dashboard (composed surface) ─────────────
// Replaces the Phase-1 stub. Composes the 9c analytics readers into role-gated sections (manifest
// §2 order / §3 inventory), reusing the project palette via tier-colors.ts (§4), the role predicates
// (§5), and the shared EmptyState (§7). Server component: requireTenant() → role booleans → ONE
// Promise.all of only the visible sections' readers → render. No real-time; page-load + the
// route-level loading.tsx affordance (§8). Errors bubble (Phase-8 convention — no try/catch here).

import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { canSeeOperations, canSeeFinancials } from "@/server/role-predicates";
import { countStalledJobs } from "@/server/analytics/stalled-jobs";
import { operationalQueue } from "@/server/analytics/operational-queue";
import {
  countOpenJobsByStatus,
  countOpenJobsByPriority,
  topClientsByOpenJobs,
  topTradesByOpenJobs,
} from "@/server/analytics/open-jobs";
import { timeInStatusDistribution } from "@/server/analytics/time-in-status";
import { timeToDispatchDistribution } from "@/server/analytics/dispatch-timing";
import { countPendingInvoices } from "@/server/analytics/pending-invoices";
import { EmptyState } from "@/components/empty-state";
import { tierBadge, statusCategoryBadge } from "@/components/dashboard/tier-colors";

const TIER_LABEL: Record<string, string> = {
  stalled: "Stalled",
  overdue: "Overdue",
  "unassigned-high-priority": "Unassigned · high priority",
  aged: "Aged",
};

/** Seconds → compact human duration (e.g. "45m", "6h 30m", "3d 4h"). */
function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

const H2 = "text-sm font-semibold text-neutral-900";
const CARD = "rounded-lg border border-neutral-200 bg-white p-4";

export default async function DashboardPage() {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const showOps = canSeeOperations(ctx);
  const showFin = canSeeFinancials(ctx);

  if (!showOps && !showFin) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <EmptyState className="mt-6" message="No dashboard panels are available for your role yet." />
      </div>
    );
  }

  // Fetch only the visible sections' data (respects the role boundary; avoids leaking financial
  // figures into a non-financial user's payload). Promise.all per Phase-8 convention.
  const [stalled, queue, statusCounts, priorityCounts, topClients, topTrades, tis, ttd, pending] =
    await Promise.all([
      showOps ? countStalledJobs(tenantId) : null,
      showOps ? operationalQueue(tenantId, 20) : null,
      showOps ? countOpenJobsByStatus(tenantId) : null,
      showOps ? countOpenJobsByPriority(tenantId) : null,
      showOps ? topClientsByOpenJobs(tenantId, 5) : null,
      showOps ? topTradesByOpenJobs(tenantId, 5) : null,
      showOps ? timeInStatusDistribution(tenantId) : null,
      showOps ? timeToDispatchDistribution(tenantId) : null,
      showFin ? countPendingInvoices(tenantId) : null,
    ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {/* 1 — Stalled summary (needs attention) */}
      {showOps && stalled && (
        <section>
          <h2 className={H2}>Needs attention</h2>
          {stalled.total === 0 ? (
            <EmptyState className="mt-3" message="No stalled jobs — everything's within SLA." />
          ) : (
            <div className={`mt-3 ${CARD}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-red-700">{stalled.total}</span>
                <span className="text-sm text-neutral-500">
                  stalled {stalled.total === 1 ? "job" : "jobs"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {stalled.byStatus.map((s) => (
                  <span
                    key={s.statusCode}
                    className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                  >
                    {s.statusCode}: {s.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 2 — Operational queue */}
      {showOps && queue && (
        <section>
          <h2 className={H2}>
            Operational queue · {queue.length} {queue.length === 1 ? "job" : "jobs"}
          </h2>
          {queue.length === 0 ? (
            <EmptyState className="mt-3" message="No open jobs in the queue." />
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Job #</th>
                    <th className="px-4 py-2 font-medium">Client</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium">Urgency</th>
                    <th className="px-4 py-2 font-medium">Age in status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {queue.map((q) => (
                    <tr key={q.jobId} className="hover:bg-neutral-50">
                      <td className="px-4 py-2">
                        <Link
                          href={`/jobs/${q.jobId}`}
                          className="font-medium text-neutral-900 hover:underline"
                        >
                          #{q.jobNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600">
                        {q.clientName}
                        {q.clientLocationName ? ` · ${q.clientLocationName}` : ""}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{q.statusLabel}</td>
                      <td className="px-4 py-2 text-neutral-600">{q.priorityCode ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${tierBadge(q.urgencyTier)}`}
                        >
                          {TIER_LABEL[q.urgencyTier] ?? q.urgencyTier}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-neutral-600">
                        {fmtDuration(q.ageInCurrentStatusSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 3 — Open by status (0-count rows included; link through to filtered /jobs) */}
      {showOps && statusCounts && (
        <section>
          <h2 className={H2}>Open by status</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {statusCounts.map((s) => (
              <Link
                key={s.statusId}
                href={`/jobs?status=${s.statusId}`}
                className={`${CARD} transition hover:border-neutral-300 hover:shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {s.statusLabel}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusCategoryBadge(s.category)}`}
                  >
                    {s.category}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-neutral-900">{s.count}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 4 — Open by priority (uncolored; rank + count; link through) */}
      {showOps && priorityCounts && (
        <section>
          <h2 className={H2}>Open by priority</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {priorityCounts.map((p) => (
              <Link
                key={p.priorityId}
                href={`/jobs?priority=${p.priorityId}`}
                className={`${CARD} transition hover:border-neutral-300 hover:shadow-sm`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {p.priorityLabel}
                  </span>
                  <span className="text-[10px] text-neutral-400">rank {p.rank}</span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-neutral-900">{p.count}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 5 + 6 — Top clients / Top trades */}
      {showOps && topClients && topTrades && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div>
            <h2 className={H2}>Top clients by open jobs</h2>
            {topClients.length === 0 ? (
              <EmptyState className="mt-3" message="No open jobs to rank by client." />
            ) : (
              <div className={`mt-3 ${CARD} space-y-1`}>
                {topClients.map((c) => (
                  <div key={c.clientId} className="flex justify-between text-sm">
                    <span className="text-neutral-700">{c.clientName}</span>
                    <span className="font-medium text-neutral-900">{c.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className={H2}>Top trades by open jobs</h2>
            {topTrades.length === 0 ? (
              <EmptyState className="mt-3" message="No open jobs to rank by trade." />
            ) : (
              <div className={`mt-3 ${CARD} space-y-1`}>
                {topTrades.map((t) => (
                  <div key={t.tradeId} className="flex justify-between text-sm">
                    <span className="text-neutral-700">{t.tradeLabel}</span>
                    <span className="font-medium text-neutral-900">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 7 + 8 — Distributions */}
      {showOps && tis && ttd && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div>
            <h2 className={H2}>Time in status</h2>
            {tis.length === 0 ? (
              <EmptyState
                className="mt-3"
                message="Not enough completed transitions yet — this lights up as jobs move through statuses."
              />
            ) : (
              <div className="mt-3 space-y-2">
                {tis.map((r) => (
                  <div key={r.statusId} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-neutral-900">{r.statusLabel}</span>
                      <span className="text-xs text-neutral-500">n={r.count}</span>
                    </div>
                    <div className="mt-1 flex gap-4 text-xs text-neutral-600">
                      <span>p50 {fmtDuration(r.p50Seconds)}</span>
                      <span>p90 {fmtDuration(r.p90Seconds)}</span>
                      <span>mean {fmtDuration(r.meanSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className={H2}>Time to dispatch</h2>
            {ttd.count === 0 ? (
              <EmptyState
                className="mt-3"
                message="No dispatched jobs yet — dispatch timing appears once vendors are assigned."
              />
            ) : (
              <div className={`mt-3 ${CARD}`}>
                <div className="text-xs text-neutral-500">n={ttd.count}</div>
                <div className="mt-2 flex gap-6 text-sm">
                  <div>
                    <div className="text-xs text-neutral-500">p50</div>
                    <div className="font-medium text-neutral-900">{fmtDuration(ttd.p50Seconds)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">p90</div>
                    <div className="font-medium text-neutral-900">{fmtDuration(ttd.p90Seconds)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">mean</div>
                    <div className="font-medium text-neutral-900">{fmtDuration(ttd.meanSeconds)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 9 — Pending invoices (financial; read-vs-write gate) */}
      {showFin && pending && (
        <section>
          <h2 className={H2}>Pending invoices</h2>
          <div className={`mt-3 ${CARD} lg:max-w-sm`}>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Vendor (AP)</span>
              <span className="font-medium text-neutral-900">{pending.vendorPending}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-neutral-500">Client (AR)</span>
              <span className="font-medium text-neutral-900">{pending.clientPending}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-neutral-100 pt-1 text-sm">
              <span className="text-neutral-500">Total</span>
              <span className="font-semibold text-neutral-900">{pending.total}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
