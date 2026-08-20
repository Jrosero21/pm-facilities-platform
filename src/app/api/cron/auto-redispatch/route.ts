// ── Phase 29 — the MANUAL-INVOKE ENTRYPOINT for autonomous re-dispatch ──────────────────────
// Run it by hand:
//   curl -X POST http://localhost:3000/api/cron/auto-redispatch -H "Authorization: Bearer $CRON_SECRET"
// Full notes: docs/phase-29-scheduled-trigger/how-to-run.md
//
// There is deliberately NO cron schedule. With no live clients an unattended timer would fire at
// test data and prove nothing, so the automated schedule is deferred until there is a real
// operation to run against. The path and header format still match what Vercel Cron sends, so
// adding a schedule later is a one-file change (a vercel.json `crons` entry) with no change here.
//
// Safe to fire at any time: with CRON_SECRET unset the endpoint is disabled outright, and with
// autonomy off (the default everywhere) a sweep scans nothing and writes nothing.
//
// It adds NO permission. It decides only WHICH TENANTS TO SCAN; every job is still re-gated inside
// autoRedispatchForStuckAssignment (kill-switch → policy → token/spend ceilings → conditions →
// quality → per-client consent), and the shared sweep core owns the stuck-filter and cooldown.

import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { agentPolicies } from "@/server/schema";
import { and, eq } from "drizzle-orm";
import { runAutoRedispatchSweep, type SweepSummary } from "@/server/auto-redispatch-sweep";
import { notifyInternalOfSweep } from "@/server/sweep-notify";

export const dynamic = "force-dynamic"; // never cached — it mutates
export const maxDuration = 300;

const AGENT_ID = "dispatch_router_v1";

/**
 * Constant-time bearer check. Both sides are SHA-256'd first so the comparison operates on
 * fixed-length buffers: timingSafeEqual throws on length mismatch, and comparing raw secrets
 * would leak the secret's length through that throw.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // fail CLOSED — an unset secret disables the endpoint, never opens it

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;

  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Tenants worth scanning: those with an ACTIVE dispatch-agent policy row (tenant-level or
 * per-client). This is a SCAN-SCOPE optimisation, not an authorisation decision — a tenant listed
 * here still auto-acts only if its resolved policy, ceilings, conditions and per-client consent all
 * permit. Omitting a tenant can only mean less work, never more permission.
 */
async function tenantsToScan(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tenantId: agentPolicies.tenantId })
    .from(agentPolicies)
    .where(and(eq(agentPolicies.agentId, AGENT_ID), eq(agentPolicies.status, "active")));
  return rows.map((r) => r.tenantId);
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    // No work done, nothing leaked about why.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const tenantIds = await tenantsToScan();

  const perTenant: Array<{ tenantId: string; summary: SweepSummary }> = [];
  const totals: SweepSummary = { swept: 0, autoSent: 0, heldForReview: 0, skipped: 0, byReason: {} };

  // SEQUENTIAL across tenants, mirroring the within-tenant rule: each sweep's spend checks should
  // see everything committed before it.
  for (const tenantId of tenantIds) {
    try {
      const summary = await runAutoRedispatchSweep({ tenantId, now: startedAt });
      perTenant.push({ tenantId, summary });

      // G3 — tell somebody. The sweep is the one path that acts with NO operator present, so
      // heldForReview > 0 would otherwise mean "the system stopped and wants a human" with no way
      // for the human to find out. Fires only when the run actually did something; idempotent per
      // tenant per hour. Isolated in its own try: the sweep's work is already committed and its
      // success must not depend on whether an email left the building.
      try {
        await notifyInternalOfSweep({ tenantId, counts: summary, at: startedAt });
      } catch (notifyErr) {
        console.error("[cron:auto-redispatch] sweep notification failed:", tenantId, notifyErr);
      }
      totals.swept += summary.swept;
      totals.autoSent += summary.autoSent;
      totals.heldForReview += summary.heldForReview;
      totals.skipped += summary.skipped;
      for (const [k, v] of Object.entries(summary.byReason)) totals.byReason[k] = (totals.byReason[k] ?? 0) + v;
    } catch (err) {
      // One tenant's failure must not abort the run.
      totals.byReason.tenant_error = (totals.byReason.tenant_error ?? 0) + 1;
      perTenant.push({
        tenantId,
        summary: { swept: 0, autoSent: 0, heldForReview: 0, skipped: 0, byReason: { error: 1 } },
      });
      console.error("[cron:auto-redispatch] tenant sweep failed:", tenantId, err);
    }
  }

  return Response.json({
    ok: true,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    tenantsScanned: tenantIds.length,
    totals,
    perTenant,
  });
}

export const GET = handle;
export const POST = handle;
