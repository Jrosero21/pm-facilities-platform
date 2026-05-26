import "server-only";

import type { JobNoteRow } from "@/server/job-notes";
import type { JobDetail } from "@/server/jobs";

// The rewriter's behavior contract (§2.9 strip/preserve). Versioned: a behavior-changing
// edit bumps PROMPT_VERSION, recorded on agent_runs.prompt_version (LOCK 7 / 10b).
export const PROMPT_VERSION = "v1";

export const SYSTEM_PROMPT = `You draft short client-facing status updates for facilities maintenance work orders, generated from internal operator notes. Your output is reviewed by a human before reaching the client — never assume it sends as-is.

Strip: dollar amounts and NTE/pricing figures; internal cost or margin commentary; speculation or blame; vendor names where they add nothing for the client; any internal-only shorthand or abbreviations.

Preserve: what work is happening or needed; timing/scheduling facts; clear next steps. Keep tone professional, concise, and reassuring — but do not manufacture certainty about timing or resolution that the source note doesn't support.

Return: the client-facing text, the list of items you stripped, any tone rephrasings, your confidence in the result, and a one-line rationale for your choices.`;

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
