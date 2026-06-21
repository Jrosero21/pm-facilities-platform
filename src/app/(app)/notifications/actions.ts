"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { autoRedispatchForStuckAssignment, type AutoRedispatchResult } from "@/server/auto-redispatch";
import { getExceptions } from "@/server/analytics/exceptions";

// Phase 28 / T2a — the per-job autonomous re-dispatch entry. Fires the gate-governed T1 core on
// ONE stuck assignment (the operator's "Auto-retry now" on a can_suggest exception row). Per-tenant.
// T1 itself never widens permission — it auto-sends only if the policy + conditions + ceilings permit,
// else leaves a suggestion DRAFT for manual approval; this action just surfaces the outcome.

export type AutoRedispatchOneState =
  | { error: string }
  | { ok: true; outcome: string; tone: "good" | "warn" | "neutral"; result: AutoRedispatchResult };

const SKIP_MESSAGE: Record<Extract<AutoRedispatchResult, { kind: "skipped" }>["reason"], string> = {
  autonomy_off: "Nothing to do — autonomy is off for this tenant/client.",
  not_stuck_sent: "Nothing to do — that dispatch is no longer awaiting a response.",
  exhausted: "Nothing to do — the re-dispatch attempt cap was reached (needs manual attention).",
  already_suggested: "Nothing to do — a replacement suggestion is already prepared.",
  no_eligible_vendor: "Nothing to do — no eligible alternate vendor (needs manual attention).",
};

export async function autoRedispatchOneAction(stuckAssignmentId: string): Promise<AutoRedispatchOneState> {
  const ctx = await requireTenant();

  let result: AutoRedispatchResult;
  try {
    result = await autoRedispatchForStuckAssignment({
      tenantId: ctx.activeTenant.tenantId,
      stuckAssignmentId,
    });
  } catch (err) {
    return { error: err instanceof Error ? `Could not auto-re-dispatch: ${err.message}` : "Could not auto-re-dispatch — please reload and try again." };
  }

  revalidatePath("/notifications");

  switch (result.kind) {
    case "auto_sent":
      return { ok: true, outcome: "Auto-re-dispatched to the next vendor — sent, and the unresponsive vendor was ghosted.", tone: "good", result };
    case "prepared_blocked":
      return { ok: true, outcome: `Held for review — ${result.blockedBy} (a replacement suggestion is ready to approve manually).`, tone: "warn", result };
    case "skipped":
      return { ok: true, outcome: SKIP_MESSAGE[result.reason], tone: "neutral", result };
  }
}

export type AutoRedispatchSweepState =
  | { error: string }
  | {
      ok: true;
      summary: { swept: number; autoSent: number; heldForReview: number; skipped: number; byReason: Record<string, number> };
    };

/**
 * Tenant-level "Auto-retry all eligible" sweep: fire T1 on every can_suggest stuck dispatch for the
 * operator's tenant, SEQUENTIALLY, and return a summary. The per-job T1 is fully gated (policy +
 * conditions + ceilings + kill-switch) — the sweep adds no permission; it just iterates the candidates.
 */
export async function autoRedispatchSweepAction(): Promise<AutoRedispatchSweepState> {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  // The candidate set = the can_suggest stuck rows (under the cap, no pending DRAFT, not exhausted).
  const exceptions = await getExceptions(tenantId);

  let swept = 0;
  let autoSent = 0;
  let heldForReview = 0;
  let skipped = 0;
  const byReason: Record<string, number> = {};

  // SEQUENTIAL — await EACH before the next (NEVER Promise.all). Spend-aggregate safety: each T1
  // calls withinSpendCeilings, so sequential firing means each sees the prior's committed spend →
  // the per-day/tenant ceiling halts a burst. Parallel would let two read the same pre-commit total.
  for (const e of exceptions) {
    if (e.kind !== "vendor_not_accepted" || e.redispatchState !== "can_suggest") continue;
    swept++;
    try {
      const r = await autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId: e.assignmentId });
      if (r.kind === "auto_sent") {
        autoSent++;
      } else if (r.kind === "prepared_blocked") {
        heldForReview++;
        byReason[r.blockedBy] = (byReason[r.blockedBy] ?? 0) + 1;
      } else {
        skipped++;
        byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
      }
    } catch {
      // One job's failure must not abort the whole sweep — T1 already closed its run failed; tally + continue.
      skipped++;
      byReason.error = (byReason.error ?? 0) + 1;
    }
  }

  revalidatePath("/notifications");
  return { ok: true, summary: { swept, autoSent, heldForReview, skipped, byReason } };
}
