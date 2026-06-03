// ── Phase 24 track A — AI Agents observability page (composed surface) ─────────────────
// A dedicated operator surface over the agent-observability readers (24b). Mirrors
// dashboard/page.tsx exactly: server component, requireTenant() → canSeeOperations gate →
// ONE Promise.all of the (ops-gated) readers → inline-JSX sections. No real-time; page-load +
// route-level loading.tsx. Errors bubble (Phase-8 convention — no try/catch here).
//
// Honesty rules: a rule-based agent's approve-as-is renders "N/A" (never 0% — that would be a
// misleading trust signal); the dispatch autonomy panel renders real zeros (no autonomous
// dispatch has occurred — true, no live trigger); genuinely-empty sections use <EmptyState>.

import { requireTenant } from "@/server/auth-context";
import { canSeeOperations } from "@/server/role-predicates";
import {
  agentVolumeByAgent,
  agentApproveAsIs,
  agentDispositionBreakdown,
  dispatchAutonomyBreakdown,
  agentCostByAgent,
  agentFailurePoints,
  agentLatencyDistribution,
} from "@/server/analytics/agent-observability";
import { EmptyState } from "@/components/empty-state";

const H2 = "text-sm font-semibold text-neutral-900";
const CARD = "rounded-lg border border-neutral-200 bg-white p-4";

/** Seconds → compact human duration (e.g. "45m", "6h 30m", "3d 4h"). Copied from dashboard. */
function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** rate (0–1) → integer percent string. */
function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default async function AgentsPage() {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const showOps = canSeeOperations(ctx);

  if (!showOps) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
        <EmptyState className="mt-6" message="The AI Agents view isn't available for your role yet." />
      </div>
    );
  }

  const [volume, approveAsIs, dispositions, dispatchAutonomy, cost, failures, latency] =
    await Promise.all([
      showOps ? agentVolumeByAgent(tenantId) : null,
      showOps ? agentApproveAsIs(tenantId) : null,
      showOps ? agentDispositionBreakdown(tenantId) : null,
      showOps ? dispatchAutonomyBreakdown(tenantId) : null,
      showOps ? agentCostByAgent(tenantId) : null,
      showOps ? agentFailurePoints(tenantId) : null,
      showOps ? agentLatencyDistribution(tenantId) : null,
    ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>

      {/* 1 — Per-agent overview */}
      {showOps && volume && (
        <section>
          <h2 className={H2}>Agent activity</h2>
          {volume.length === 0 ? (
            <EmptyState className="mt-3" message="No agent runs yet — this lights up as agents run." />
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Agent</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                    <th className="px-4 py-2 font-medium">Succeeded</th>
                    <th className="px-4 py-2 font-medium">Failed</th>
                    <th className="px-4 py-2 font-medium">Input tokens</th>
                    <th className="px-4 py-2 font-medium">Output tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {volume.map((a) => (
                    <tr key={a.agentId} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 font-medium text-neutral-900">{a.agentId}</td>
                      <td className="px-4 py-2 text-neutral-600">{a.total}</td>
                      <td className="px-4 py-2 text-neutral-600">{a.succeeded}</td>
                      <td className="px-4 py-2 text-neutral-600">{a.failed}</td>
                      <td className="px-4 py-2 text-neutral-600">{a.inputTokens}</td>
                      <td className="px-4 py-2 text-neutral-600">{a.outputTokens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 2 — Approve-as-is */}
      {showOps && approveAsIs && (
        <section>
          <h2 className={H2}>Approve-as-is rate</h2>
          {approveAsIs.length === 0 ? (
            <EmptyState className="mt-3" message="No reviewable agents yet." />
          ) : (
            <div className={`mt-3 ${CARD} space-y-2`}>
              {approveAsIs.map((a) => (
                <div key={a.agentId} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">{a.agentId}</span>
                  {a.applicable ? (
                    <span className="font-medium text-neutral-900">
                      {fmtPct(a.rate)}{" "}
                      <span className="text-xs font-normal text-neutral-500">
                        ({a.approvedAsIs}/{a.reviewed} approved as-is)
                      </span>
                    </span>
                  ) : (
                    <span className="text-neutral-500">
                      N/A <span className="text-xs">· rule-based — no review step</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3 — Disposition breakdown */}
      {showOps && dispositions && (
        <section>
          <h2 className={H2}>Decision dispositions</h2>
          {dispositions.length === 0 ? (
            <EmptyState className="mt-3" message="No agent decisions recorded yet." />
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Agent</th>
                    <th className="px-4 py-2 font-medium">Queued for review</th>
                    <th className="px-4 py-2 font-medium">Auto-executed</th>
                    <th className="px-4 py-2 font-medium">Policy-blocked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {dispositions.map((d) => (
                    <tr key={d.agentId} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 font-medium text-neutral-900">{d.agentId}</td>
                      <td className="px-4 py-2 text-neutral-600">{d.queuedForReview}</td>
                      <td className="px-4 py-2 text-neutral-600">{d.autoExecuted}</td>
                      <td className="px-4 py-2 text-neutral-600">{d.policyBlocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 4 — Autonomy (dispatch) panel — zeros are meaningful (no autonomous dispatch yet) */}
      {showOps && dispatchAutonomy && (
        <section>
          <h2 className={H2}>Autonomous dispatch (dispatch_router_v1)</h2>
          <div className={`mt-3 ${CARD} lg:max-w-sm`}>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Auto-executed</span>
              <span className="font-medium text-neutral-900">{dispatchAutonomy.autoExecuted}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-neutral-500">Policy-blocked</span>
              <span className="font-medium text-neutral-900">{dispatchAutonomy.policyBlocked}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-neutral-100 pt-1 text-sm">
              <span className="text-neutral-500">Queued for review</span>
              <span className="font-medium text-neutral-900">{dispatchAutonomy.queuedForReview}</span>
            </div>
          </div>
        </section>
      )}

      {/* 5 — Cost per agent (per agent × model) */}
      {showOps && cost && (
        <section>
          <h2 className={H2}>Cost per agent</h2>
          {cost.length === 0 ? (
            <EmptyState className="mt-3" message="No measurable LLM cost yet." />
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Agent</th>
                    <th className="px-4 py-2 font-medium">Model</th>
                    <th className="px-4 py-2 font-medium">Input $</th>
                    <th className="px-4 py-2 font-medium">Output $</th>
                    <th className="px-4 py-2 font-medium">Total $</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {cost.map((c) => (
                    <tr key={`${c.agentId}:${c.model}`} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 font-medium text-neutral-900">{c.agentId}</td>
                      <td className="px-4 py-2 text-neutral-600">{c.model}</td>
                      <td className="px-4 py-2 text-neutral-600">{c.inputCost}</td>
                      <td className="px-4 py-2 text-neutral-600">{c.outputCost}</td>
                      <td className="px-4 py-2 font-medium text-neutral-900">{c.totalCost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 6 — Failure points */}
      {showOps && failures && (
        <section>
          <h2 className={H2}>Failure points</h2>
          {failures.length === 0 ? (
            <EmptyState className="mt-3" message="No failures." />
          ) : (
            <div className="mt-3 space-y-2">
              {failures.map((f) => (
                <div key={f.agentId} className={CARD}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-neutral-900">{f.agentId}</span>
                    <span className="text-xs text-neutral-500">
                      {f.failedCount} failed {f.failedCount === 1 ? "run" : "runs"}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {f.recentErrors.map((e, i) => (
                      <li key={i} className="font-mono text-xs text-neutral-600">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 7 — Run latency */}
      {showOps && latency && (
        <section>
          <h2 className={H2}>Run latency</h2>
          {latency.count === 0 ? (
            <EmptyState className="mt-3" message="No completed runs yet — latency appears once runs finish." />
          ) : (
            <div className={`mt-3 ${CARD}`}>
              <div className="text-xs text-neutral-500">n={latency.count}</div>
              <div className="mt-2 flex gap-6 text-sm">
                <div>
                  <div className="text-xs text-neutral-500">p50</div>
                  <div className="font-medium text-neutral-900">{fmtDuration(latency.p50Seconds)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">p90</div>
                  <div className="font-medium text-neutral-900">{fmtDuration(latency.p90Seconds)}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">mean</div>
                  <div className="font-medium text-neutral-900">{fmtDuration(latency.meanSeconds)}</div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
