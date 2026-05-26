// Phase 7 batch 7c (step 1) — agent-config seed: scope_generator_v1 prompt + policy.
//
// Seeds the PLATFORM DEFAULTS only (ai_prompt_template_defaults + agent_policy_defaults) —
// NO tenant-specific rows. The runtime resolver falls through tenant -> defaults (OQ #3),
// so a platform-provided agent works for every tenant with no per-tenant seeding; a tenant
// row exists only to override, and Phase 7 has no override. (D1: a tenant row with no
// override would exist solely to defeat fall-through — ceremonial.)
//
// model_hint / temperature mirror the Phase 6 rewriter: same gateway/routing/footprint
// (anthropic/claude-sonnet-4-6 @ 0.30). status='active' is set explicitly (the column
// default is 'draft'; the resolver only reads 'active').
//
// user_prompt_template is intentionally NULL in Phase 7; the per-run user prompt is
// code-assembled by buildScopeUserPrompt (step 2). The column activates when the templating
// engine ships (Phase 13 / email_templates). This is a dated future-shape, not an oversight.
//
// The policy is the minimal { requiresReview: true } — the only field Phase 7 enforces
// (§2.9). It is NOT pre-shaped with fields no code reads.
//
// Idempotent: keyed on the defaults tables' resolver keys — ai_prompt_template_defaults by
// (agent_id, variant) [F1 UNIQUE], agent_policy_defaults by (agent_id) [F1 UNIQUE]. Safe to
// re-run; existing rows are left as-is (this seed does not bump versions of rows already
// present). Seed inserts write no audit row (bootstrap config, not operator-created).
//
// Run:
//   pnpm db:seed:agent-config

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { aiPromptTemplateDefaults, agentPolicyDefaults } from "@/server/schema";

const AGENT_ID = "scope_generator_v1";
const VARIANT = "default";
const MODEL_HINT = "anthropic/claude-sonnet-4-6";
const TEMPERATURE = "0.30";

// The versioned behavior contract for scope_generator_v1 (§2.5 / Surface #6). A
// behavior-affecting edit bumps the row's version (R-7.x); cosmetic edits may overwrite.
const SYSTEM_PROMPT = `You generate a structured scope of work for a field technician handling a commercial facilities maintenance work order. You are given a short problem description plus the trade, client, location, and priority. Your output is a DRAFT: an operator reviews and edits it before it is approved and used to dispatch a vendor — never assume it is final or that it dispatches as written.

Produce an ordered list of concrete, actionable steps a technician can follow on site, in a logical sequence: assess the situation, diagnose or verify the cause, perform the corrective work, test that the fix holds, clean the work area, and document the outcome. Each step is a single imperative instruction (for example, "Assess the affected fixture and surrounding area"). Keep instructions specific to the stated trade and problem.

When the cause is uncertain from the description, include explicit assessment and diagnostic steps rather than assuming a root cause. Do not fabricate certainty about the cause, the fix, or the outcome that the description does not support.

If the problem description is too vague to identify a clear scope, return assessment-only steps (no corrective actions), set confidence to 'low', and note the gap in your assumptions. Do not invent symptoms or causes the description does not state.

For each step you may set:
- category: one of assess (pre-work investigation and diagnosis), perform, cleanup, verify (post-work confirmation that the fix holds), document — the kind of work the step represents.
- expectsPhoto: true when before/after photo evidence should be captured (typically assessment, verification, and documentation steps). Set expectsPhoto on the relevant steps themselves — do not generate a standalone 'upload photos' step.

Do NOT include: pricing, not-to-exceed amounts, or cost commentary; vendor selection or scheduling commitments; client-facing messaging. The scope describes the WORK to be done, not the commercial or dispatch decisions around it — those are the operator's.

Use the client, location, and priority context only to tailor the work (for example, site access or urgency that changes the steps); do not restate that context as steps. List any material assumptions you made (for example, fixture type or scope boundaries) so the operator can correct them.

Return: the ordered steps, the assumptions you made, your confidence in the scope, and a one-line rationale for your choices.`;

// Minimal policy — the only field Phase 7 enforces (§2.9). The agent always queues for
// review; no auto-execute.
const POLICY = { requiresReview: true };

async function main() {
  console.log("[seed:agent-config] starting");

  // ai_prompt_template_defaults — scope_generator_v1 / default (F1: UNIQUE(agent_id, variant)).
  const existingPrompt = await db
    .select({ id: aiPromptTemplateDefaults.id })
    .from(aiPromptTemplateDefaults)
    .where(
      and(
        eq(aiPromptTemplateDefaults.agentId, AGENT_ID),
        eq(aiPromptTemplateDefaults.variant, VARIANT),
      ),
    )
    .limit(1);
  let promptInserted = 0;
  if (existingPrompt.length === 0) {
    await db.insert(aiPromptTemplateDefaults).values({
      agentId: AGENT_ID,
      variant: VARIANT,
      version: 1,
      status: "active",
      systemPrompt: SYSTEM_PROMPT,
      userPromptTemplate: null,
      modelHint: MODEL_HINT,
      temperature: TEMPERATURE,
    });
    promptInserted = 1;
  }

  // agent_policy_defaults — scope_generator_v1 (F1: UNIQUE(agent_id)).
  const existingPolicy = await db
    .select({ id: agentPolicyDefaults.id })
    .from(agentPolicyDefaults)
    .where(eq(agentPolicyDefaults.agentId, AGENT_ID))
    .limit(1);
  let policyInserted = 0;
  if (existingPolicy.length === 0) {
    await db.insert(agentPolicyDefaults).values({
      agentId: AGENT_ID,
      policy: POLICY,
      version: 1,
      status: "active",
    });
    policyInserted = 1;
  }

  console.log(
    `[seed:agent-config] prompt default: ${promptInserted ? "inserted" : "already present"}; ` +
      `policy default: ${policyInserted ? "inserted" : "already present"}`,
  );
  console.log("[seed:agent-config] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:agent-config] failed:", err);
    process.exit(1);
  });
