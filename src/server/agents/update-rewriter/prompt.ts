import "server-only";

import type { JobNoteRow } from "@/server/job-notes";
import type { JobDetail } from "@/server/jobs";

// The rewriter's per-run user prompt assembly. The system prompt (the §2.9 behavior contract)
// is now DB-stored in ai_prompt_templates — seed source-of-record db/seeds/agent-config.ts,
// resolved at runtime by runRewriter; it no longer lives in code (step 3 retrofit). The
// versioned prompt_version is the DB row's version (recorded on agent_runs.prompt_version).

/** Assemble the per-run user prompt: the source note + job/client/vendor context. */
export function buildUserPrompt(input: {
  note: JobNoteRow;
  job: JobDetail;
  vendorNames: string[];
}): string {
  const { note, job, vendorNames } = input;
  return [
    `Client: ${job.clientName ?? "—"}`,
    `Trade: ${job.tradeName ?? "—"}`,
    `Location: ${job.locationName ?? "—"}`,
    `Problem: ${job.problemDescription}`,
    vendorNames.length ? `Assigned vendor(s): ${vendorNames.join(", ")}` : null,
    ``,
    `Internal note to rewrite for the client:`,
    note.body,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
