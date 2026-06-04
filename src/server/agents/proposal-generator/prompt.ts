import "server-only";

import type { JobDetail } from "@/server/jobs";

// The proposal generator's per-run user prompt assembly. The system prompt (the §2.9 behavior
// contract) is DB-stored in ai_prompt_templates — seed source-of-record db/seeds/agent-config.ts,
// resolved at runtime by runProposalGenerator. This builder is a pure string assembler.
//
// MONEY-SAFETY (D1): unlike the invoice creator there is NO source-cost context to show — the
// proposal is drafted from job context alone, and the model returns category + description +
// scopePhrasing per line. The operator authors all dollar figures at the review gate.

/** Assemble the per-run user prompt from job context, with explicit money-safety instructions. */
export function buildProposalUserPrompt(input: { job: JobDetail }): string {
  const { job } = input;

  return [
    `You are drafting an internal PROPOSAL for a facilities maintenance work order. A proposal is a`,
    `priced commercial document — but YOU write only the line-item PHRASING. You must NOT output any`,
    `amounts; the operator prices each line at review and the platform applies the markup rules.`,
    ``,
    `Job context:`,
    `  Client: ${job.clientName ?? "—"}`,
    `  Trade: ${job.tradeName ?? "—"}`,
    `  Location: ${job.locationName ?? "—"}`,
    `  Status: ${job.statusName}`,
    `  Problem: ${job.problemDescription}`,
    job.approvedScopeOfWork ? `  Approved scope:\n${job.approvedScopeOfWork}` : null,
    ``,
    `Instructions:`,
    `- Break the work into proposal lines. For EACH line, write: a short client-facing description,`,
    `  and the scopePhrasing — the work-scope language describing what that line covers. Choose a`,
    `  category from: labor, materials, equipment, trip, permit, fee, tax, other.`,
    `- Do NOT output quantity, unit price, markup, or any dollar figure — phrasing only.`,
    `- Use the problem statement and approved scope to decide the lines; do not invent work that`,
    `  is not implied by the job context.`,
    `- Return your confidence and a one-line rationale.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
