"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { autoRedispatchForStuckAssignment, type AutoRedispatchResult } from "@/server/auto-redispatch";
import { runAutoRedispatchSweep } from "@/server/auto-redispatch-sweep";
import { canManageTenantSettings, setPriorityClientWeighting } from "@/server/tenant-settings";

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

  // Phase 29: the loop body moved VERBATIM into runAutoRedispatchSweep so the operator button and
  // the scheduled trigger run the same code — including the can_suggest stuck-filter, which is the
  // only thing standing between a trigger and re-dispatching healthy jobs (T1 has no staleness
  // check of its own). This action keeps exactly its request-scoped concerns: auth + revalidate.
  // Behaviour is unchanged for the button, except that the shared core now also applies the per-job
  // cooldown (a job auto-re-dispatched within REDISPATCH_COOLDOWN_HOURS is skipped as "cooldown").
  const summary = await runAutoRedispatchSweep({ tenantId: ctx.activeTenant.tenantId });

  revalidatePath("/notifications");
  return { ok: true, summary };
}

export type TenantWeightingState = { error: string } | null;

/**
 * Toggle the tenant's client-priority weighting switch (checkbox form). A tenant-WIDE config change →
 * gated on tenant_admin (super_admin passes) via the pure canManageTenantSettings, mirroring the
 * accounting gate. setPriorityClientWeighting audits it.
 */
export async function setTenantPriorityWeightingAction(
  _prev: TenantWeightingState,
  formData: FormData,
): Promise<TenantWeightingState> {
  const ctx = await requireTenant();
  if (!canManageTenantSettings(ctx.roleKeys, ctx.isSuperAdmin)) redirect("/forbidden");
  await setPriorityClientWeighting({
    tenantId: ctx.activeTenant.tenantId,
    enabled: formData.get("value") === "true",
    actorUserId: ctx.user.id,
  });
  revalidatePath("/notifications");
  return null;
}
