"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/server/auth-context";
import { autoRedispatchForStuckAssignment, type AutoRedispatchResult } from "@/server/auto-redispatch";

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
