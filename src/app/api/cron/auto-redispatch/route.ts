// ── Phase 29 — the scheduled-trigger ENTRYPOINT for autonomous re-dispatch ──────────────────
// The route exists and works; NOTHING fires it yet. No vercel.json cron entry is declared in this
// stage — scheduling and deploy are a separate, explicitly gated step. Until then this is an
// endpoint that only someone holding CRON_SECRET can invoke.
//
// It adds NO permission. It decides only WHICH TENANTS TO SCAN; every job is still re-gated inside
// autoRedispatchForStuckAssignment (kill-switch → policy → token/spend ceilings → conditions →
// quality → per-client consent), and the shared sweep core owns the stuck-filter and cooldown.

import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { agentPolicies } from "@/server/schema";
import { and, eq } from "drizzle-orm";
import { runAutoRedispatchSweep, type SweepSummary } from "@/server/auto-redispatch-sweep";

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
