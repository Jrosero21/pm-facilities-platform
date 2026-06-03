import "server-only";

import { and, count, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { agentToolCalls, agentDecisions } from "@/server/schema";

// ── Phase 24 track C — AGENT-PAYLOAD RETENTION (shared eligibility) ────────────────────
// The SINGLE source of the 180-day eligibility predicate + counter, so the retention SCRIPT
// (scripts/retention-agent-payloads.ts, dry-run + --apply) and the phase-24 harness exercise
// ONE implementation — no duplicated SQL. DB-side age threshold (NOW() - INTERVAL 180 DAY),
// never a JS Date (the JS-Date-vs-DB-timezone bug class). Eligibility = aged AND still carrying
// a payload (the IS NOT NULL clause makes clearing idempotent — already-NULL rows are skipped).
//
// A non-executing module (no top-level main()) so it is safe to import from both the script and
// the harness.

export const RETENTION_DAYS = 180;

const olderThan = (createdAt: typeof agentToolCalls.createdAt | typeof agentDecisions.createdAt) =>
  sql`${createdAt} < NOW() - INTERVAL ${sql.raw(String(RETENTION_DAYS))} DAY`;

/** agent_tool_calls aged past the window AND still carrying a tool_input or tool_output payload. */
export const toolCallsEligible = and(
  olderThan(agentToolCalls.createdAt),
  sql`(${agentToolCalls.toolInput} IS NOT NULL OR ${agentToolCalls.toolOutput} IS NOT NULL)`,
);

/** agent_decisions aged past the window AND still carrying a metadata payload. */
export const decisionsEligible = and(
  olderThan(agentDecisions.createdAt),
  isNotNull(agentDecisions.metadata),
);

export type EligiblePayloadCounts = { toolCalls: number; decisions: number; total: number };

/** Count payload rows currently eligible for clearing (read-only; writes nothing). */
export async function countEligibleAgentPayloads(): Promise<EligiblePayloadCounts> {
  const toolCalls = Number(
    (await db.select({ n: count() }).from(agentToolCalls).where(toolCallsEligible))[0]?.n ?? 0,
  );
  const decisions = Number(
    (await db.select({ n: count() }).from(agentDecisions).where(decisionsEligible))[0]?.n ?? 0,
  );
  return { toolCalls, decisions, total: toolCalls + decisions };
}
