/**
 * scripts/retention-agent-payloads.ts — Phase 24 track C: 180-DAY AGENT-PAYLOAD RETENTION.
 *
 * Ages out the heavy JSON longtext payloads on agent runs, keyed on the existing created_at.
 * SUMMARY data is preserved permanently — the observability dashboard, cost reader, approve-as-is
 * adapters, guardrails, and policy resolver lose NOTHING (none read these bodies; verified 24d-A).
 *
 * CLEARS (set to NULL) — exactly three nullable longtext columns:
 *   • agent_tool_calls.tool_input
 *   • agent_tool_calls.tool_output
 *   • agent_decisions.metadata
 *
 * NULL-NOT-DELETE: rows are never deleted (CASCADE-FK finding — deleting an agent_runs row
 * cascade-wipes decisions/tool_calls/drafts/reviews; deleting decisions/tool_calls destroys
 * disposition/tool-call counts). We only NULL the payload; every summary row + FK survives.
 *
 * GLOBAL-BY-AGE: a platform storage-hygiene policy keyed purely on age — one UPDATE per table,
 * no tenant_id filter. IDEMPOTENT: the "IS NOT NULL" clause skips already-cleared rows, so
 * re-runs are no-ops. DB-SIDE threshold: NOW() - INTERVAL 180 DAY evaluated against the DB's own
 * created_at clock (NEVER a JS Date — avoids the JS-Date-vs-DB-timezone bug class).
 *
 * The two UPDATEs this script runs, for an admin running them by hand (SQL option-b):
 *   UPDATE agent_tool_calls
 *     SET tool_input = NULL, tool_output = NULL
 *     WHERE created_at < NOW() - INTERVAL 180 DAY
 *       AND (tool_input IS NOT NULL OR tool_output IS NOT NULL);
 *   UPDATE agent_decisions
 *     SET metadata = NULL
 *     WHERE created_at < NOW() - INTERVAL 180 DAY
 *       AND metadata IS NOT NULL;
 *
 * HONEST RETENTION NOTE (24d-A flag): after 180 days, two surfaces OUTSIDE the protected
 * observability set show cleared content — getRunTrace (per-run debug tool bodies) and the
 * review-queue decisionMetadata rationale (listDraftsForJobDetailed / scope equivalent). This is
 * the INTENDED effect of retention, not observability data loss: all aggregate/summary/cost/
 * disposition/approve-as-is history is preserved; only the heavy bodies of aged rows go NULL.
 *
 * SAFETY POSTURE: DRY-RUN by default (reports eligible counts, writes NOTHING). Pass --apply to
 * perform the NULL-ing. This is a PROD-CAPABLE operational tool (like the db/seeds/* scripts, which
 * run against the configured DATABASE_URL) — it deliberately does NOT force-rewrite to a sandbox DB
 * the way the check-*.ts test harnesses do (that guard would make this tool unable to ever clear
 * prod, defeating its purpose). The dry-run default + the loud target-DB print ARE the write-safety;
 * the operator confirms the target before passing --apply. (Deviation from "mirror the check-script
 * sandbox guard" — flagged for review; the test-harness guard is the wrong guard for a prod tool.)
 *
 * Run:
 *   pnpm db:retention:agent-payloads            # DRY RUN — report only
 *   pnpm db:retention:agent-payloads -- --apply # APPLY — NULL the aged payloads
 */

export {}; // module isolation — keep this script's top-level `main()` out of the global scope
// (a bare script's global `main()` collides with other harness scripts' — TS2393; CF-24.1).

const APPLY = process.argv.includes("--apply") || process.env.APPLY === "1";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[retention] DATABASE_URL not set");
    process.exit(2);
  }
  const dbName = url.match(/\/([^/?]+)(\?|$)/)?.[1] ?? "(unknown)";

  const { db } = await import("@/server/db");
  const { agentToolCalls, agentDecisions } = await import("@/server/schema");
  // Eligibility predicate + counter are shared with the phase-24 harness (ONE implementation).
  const { RETENTION_DAYS, toolCallsEligible, decisionsEligible, countEligibleAgentPayloads } =
    await import("@/server/agents/retention");

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`[retention] agent-payload retention — ${RETENTION_DAYS}-day policy`);
  console.log(`[retention] target DB: ${dbName}`);
  console.log(`[retention] mode: ${APPLY ? "APPLYING (will NULL aged payloads)" : "DRY RUN (no writes)"}`);
  console.log("──────────────────────────────────────────────────────────────");

  if (!APPLY) {
    // DRY RUN — count what WOULD be cleared (shared counter); write nothing.
    const { toolCalls: tcCount, decisions: adCount, total } = await countEligibleAgentPayloads();
    console.log(`[retention] DRY RUN — eligible agent_tool_calls (tool_input/tool_output): ${tcCount}`);
    console.log(`[retention] DRY RUN — eligible agent_decisions (metadata): ${adCount}`);
    console.log(
      total === 0
        ? "[retention] DRY RUN — nothing eligible; no-op. (Run with --apply when rows age past the window.)"
        : `[retention] DRY RUN — re-run with --apply to NULL ${total} payload row(s). NOTHING WAS WRITTEN.`,
    );
    return;
  }

  // APPLY — NULL the aged payloads (NULL-not-delete). Two UPDATEs; rows survive.
  const tcRes = await db
    .update(agentToolCalls)
    .set({ toolInput: null, toolOutput: null })
    .where(toolCallsEligible);
  const adRes = await db.update(agentDecisions).set({ metadata: null }).where(decisionsEligible);
  console.log(`[retention] APPLIED — agent_tool_calls payloads NULLed: ${tcRes.rowCount}`);
  console.log(`[retention] APPLIED — agent_decisions metadata NULLed: ${adRes.rowCount}`);
  console.log("[retention] done. Summary columns (model/tokens/status/disposition/timestamps) untouched.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[retention] FAILED:", e);
    process.exit(1);
  });
