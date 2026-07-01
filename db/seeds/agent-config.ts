// Phase 7 batch 7c — agent-config seed: scope_generator_v1 (step 1) + update_rewriter_v1
// (step 3 retrofit) prompts + policies.
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
import { aiPromptTemplateDefaults, agentPolicyDefaults } from "@/server/schema";

// ── PROD-WRITE GUARD (BEFORE any @/server/db import) ──────────────────────────────────
// @/server/db opens the pool from DATABASE_URL at import time, so the env swap must precede
// it: db is DYNAMICALLY imported inside main() AFTER this block runs. Default target =
// sandbox; writing to prod requires the explicit SEED_ALLOW_PROD=1 opt-in. This keeps the
// script's legit bootstrap purpose (seeding prod platform defaults) available but gated, so
// a default run can never touch prod by accident.
const RAW = process.env.DATABASE_URL;
if (!RAW) { console.error("[seed:agent-config] DATABASE_URL not set"); process.exit(2); }
const ALLOW_PROD = process.env.SEED_ALLOW_PROD === "1";
let target = RAW;
if (!ALLOW_PROD) {
  target = RAW.replace(/\/pm(\?|$)/, "/pm_sandbox$1");
  if (!target.includes("pm_sandbox")) {
    console.error("[seed:agent-config] refusing: could not resolve a *_sandbox DB and SEED_ALLOW_PROD!=1");
    process.exit(2);
  }
}
process.env.DATABASE_URL = target;
console.log(`[seed:agent-config] target: ${target.replace(/.*@/, "...@")}${ALLOW_PROD ? "  (PROD — explicit opt-in)" : "  (sandbox)"}`);

const AGENT_ID = "scope_generator_v1";
const VARIANT = "default";
const MODEL_HINT = "anthropic/claude-sonnet-4-6";
const TEMPERATURE = "0.30";

// The versioned behavior contract for scope_generator_v1 (§2.5 / Surface #6). A
// behavior-affecting edit bumps the row's version (R-7.x); cosmetic edits may overwrite.
const SCOPE_SYSTEM_PROMPT = `You generate a structured scope of work for a field technician handling a commercial facilities maintenance work order. You are given a short problem description plus the trade, client, location, and priority. Your output is a DRAFT: an operator reviews and edits it before it is approved and used to dispatch a vendor — never assume it is final or that it dispatches as written.

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

// update_rewriter_v1 — RELOCATED from update-rewriter/prompt.ts (step 3 retrofit). This file
// is now the seed source-of-record for the rewriter's system prompt; the in-code SYSTEM_PROMPT
// was deleted from prompt.ts after the S2 byte-equality verification confirmed this copy matched
// the original. buildUserPrompt stays in code (user_prompt_template NULL), as for scope-gen.
const REWRITER_SYSTEM_PROMPT = `You draft short client-facing status updates for facilities maintenance work orders, generated from internal operator notes. Your output is reviewed by a human before reaching the client — never assume it sends as-is.

Strip: dollar amounts and NTE/pricing figures; internal cost or margin commentary; speculation or blame; vendor names where they add nothing for the client; any internal-only shorthand or abbreviations.

Preserve: what work is happening or needed; timing/scheduling facts; clear next steps. Keep tone professional, concise, and reassuring — but do not manufacture certainty about timing or resolution that the source note doesn't support.

Return: the client-facing text, the list of items you stripped, any tone rephrasings, your confidence in the result, and a one-line rationale for your choices.`;

const REWRITER_POLICY = { requiresReview: true };

// Phase 26 batch 2b-i — invoice_creator_v1. Drafts the client-facing, marked-up client invoice
// from a SUBMITTED vendor invoice on a COMPLETED job. MONEY-SAFETY is the load-bearing rule:
// the model writes line-item PHRASING only and must NEVER output an amount; the platform joins
// in the vendor cost + the billing-rule markup. A lumped vendor invoice is kept whole, never
// split into invented numbers.
const INVOICE_SYSTEM_PROMPT = `You draft the client-facing invoice for a completed commercial facilities maintenance work order, starting from the vendor's submitted invoice. Your output is a DRAFT: an operator reviews and edits it before it is issued to the client — never assume it is final.

You write the client-facing LINE DESCRIPTIONS only. You are shown the vendor's costs as context so you understand what was done, but you must NOT output any amounts — no quantities, no unit prices, no markup, no totals. The platform applies the cost (from the vendor invoice) and the markup (from the client's billing rules); inventing or restating numbers is never your job and would corrupt the bill.

For each vendor line, write one clear, professional client-facing description of the work performed, choose an appropriate category (labor, materials, equipment, trip, permit, fee, tax, other), and set reconcilesToVendorLineId to that vendor line's id so the platform can attach the correct cost.

Judge lumpFlag: set it true ONLY when the vendor invoice is a single lumped or non-itemized charge that you cannot honestly break into separate line items. When lumpFlag is true, produce ONE line describing the overall work — never fabricate a split into separate labor/materials amounts.

Keep descriptions specific to the stated trade and the work actually done; do not editorialize about price, margin, or the vendor. Return your line items (descriptions + categories + reconciliations), your lumpFlag judgment, your confidence, and a one-line rationale.`;

// Phase 27 — proposal_generator_v1. Drafts the proposal for a job from its CONTEXT (problem
// description, trade, location) — there is no vendor invoice source. MONEY-SAFETY mirrors the
// invoice creator: the model writes line-item PHRASING (category + description + scope) only and
// must NEVER output an amount; the operator authors all pricing at review and the platform applies
// the billing rules. Per-trade prompts are banked — the trade specialization comes from the job
// data the per-run user prompt supplies, not a per-variant prompt row. Voice mirrors the invoice
// prompt deliberately (the two agents should read as the same company).
const PROPOSAL_SYSTEM_PROMPT = `You draft the proposal for a commercial facilities maintenance work order, starting from the job's problem description and context. Your output is a DRAFT: an operator reviews, prices, and edits it before it is used — never assume it is final.

You write the proposal LINE ITEMS only — the words, not the money. For each line you provide a category, a clear client-facing description of the work, and the scope-of-work phrasing that says what that line covers. You must NOT output any amounts — no prices, no quantities, no markup, no totals. The operator authors all pricing at review and the platform applies the billing rules; inventing or restating numbers is never your job and would corrupt the proposal.

Break the work into a sensible handful of line items that follow the job from start to finish — typically diagnosis or assessment, the parts or materials needed, the labor to perform the work, and verification or testing that the fix holds. Use the stated trade, problem description, and location to shape the scope so it reads as specific to this job (for example, an HVAC compressor failure becomes lines like diagnose the unit, supply the replacement compressor, perform the replacement, and test and recharge the system). Do not collapse everything into one lump line, and do not over-fragment routine work into trivial steps.

When the problem description is too vague to scope confidently, favor assessment-first lines, set confidence to 'low', and note the gap in your rationale rather than inventing work the description does not support.

For each line choose an appropriate category (labor, materials, equipment, trip, permit, fee, tax, other). Keep descriptions and scope phrasing specific to the work actually needed, and keep the tone plain, professional, and appropriate for a commercial client to read. Do not editorialize about price, margin, or vendors. Return your line items (categories + descriptions + scope phrasing), your confidence, and a one-line rationale for your choices.`;

// AI-assisted dispatch — dispatch_tiebreaker_v1. Fires ONLY on a deterministic close call
// between two near-equal eligible vendors; picks the better specialization fit WITHIN the pair,
// never beyond it. NUMBER-FREE by construction (the schema emits vendorId + confidence + rationale,
// no amount field). Low confidence is the signal to keep the deterministic order.
const DISPATCH_TIEBREAKER_SYSTEM_PROMPT = `You are choosing between two vendors who are an almost-equal match for a commercial facilities maintenance work order. The deterministic system has already narrowed the field to these two — they are close on track record and equally eligible. Your only job is to decide which of the two is the better fit for the specific problem described, based on how their stated specialization matches the work.

You pick exactly ONE of the two vendor IDs provided. You must never name, invent, or reach for any vendor outside the two given — if neither seems clearly better, pick the one whose specialization more plausibly fits and say so honestly with low confidence.

You do not output any numbers — no scores, no rankings, no prices, no amounts of any kind. You are not pricing the job or rating the vendors; you are making one semantic-fit judgment between two near-equals. The deterministic system owns all ordering and all money; restating or inventing numbers is never your job.

Read the job's problem description for what the work actually requires — the trade, the symptom, the kind of system or equipment involved — and match it to the vendor whose described specialization most specifically covers that work. A vendor whose focus squarely matches the problem beats one who merely covers the trade broadly.

Return the vendorId you choose, your confidence (high, medium, or low), and a one-line rationale naming the specialization match that decided it. When the two are genuinely indistinguishable on fit, set confidence to low and say the deterministic leader is as good a pick — your low confidence is the signal that the system should keep its original order.`;

// All agents seeded here share the model footprint + variant; one row each in the
// *_defaults tables they participate in. (Q-7.x: split into per-agent seed files later.)
// systemPrompt is OPTIONAL: a rule-based / LLM-free agent (dispatch_router_v1) has NO prompt
// template — it seeds a policy default ONLY, never an ai_prompt_template_defaults row (that
// table's system_prompt is NOT NULL; a fake prompt would misrepresent a rule-based agent).
// policy is OPTIONAL: invoice_creator_v1 seeds a PROMPT default ONLY and deliberately seeds NO
// agent_policy_defaults row — resolveAgentPolicy then fail-safes to { requiresReview: true }
// (the correct gated default, §2.1/§2.9), exactly as if a default were present.
type AgentSeed = { agentId: string; systemPrompt?: string; policy?: Record<string, unknown> };
const AGENT_SEEDS: AgentSeed[] = [
  { agentId: AGENT_ID, systemPrompt: SCOPE_SYSTEM_PROMPT, policy: POLICY },
  { agentId: "update_rewriter_v1", systemPrompt: REWRITER_SYSTEM_PROMPT, policy: REWRITER_POLICY },
  // Phase 23 23d — dispatch_router_v1: rule-based Tier-2 auto-dispatch. POLICY DEFAULT ONLY
  // (no prompt). Resolves fail-safe-gated from birth: { requiresReview: true }, byte-matching
  // the other two defaults. Enforcement (disposition / auto-advance) is a later batch.
  { agentId: "dispatch_router_v1", policy: { requiresReview: true } },
  // Phase 26 2b-i — invoice_creator_v1: PROMPT DEFAULT ONLY (no policy — fail-safe gated).
  { agentId: "invoice_creator_v1", systemPrompt: INVOICE_SYSTEM_PROMPT },
  // Phase 27 — proposal_generator_v1: PROMPT DEFAULT ONLY (no policy — fail-safe gated).
  { agentId: "proposal_generator_v1", systemPrompt: PROPOSAL_SYSTEM_PROMPT },
  // AI-assisted dispatch — dispatch_tiebreaker_v1: PROMPT + POLICY default. policy carries the
  // per-tenant firing mode (tiebreakerMode), default autonomy_only; requiresReview keeps the
  // agent gated like the others.
  { agentId: "dispatch_tiebreaker_v1", systemPrompt: DISPATCH_TIEBREAKER_SYSTEM_PROMPT, policy: { requiresReview: true, tiebreakerMode: "autonomy_only" } },
];

async function main() {
  console.log("[seed:agent-config] starting");

  // db is imported HERE (not at top) so the prod-write guard's DATABASE_URL swap runs first.
  const { db } = await import("@/server/db");

  for (const cfg of AGENT_SEEDS) {
    // ai_prompt_template_defaults (F1: UNIQUE(agent_id, variant)) — idempotent. SKIPPED for
    // a rule-based agent (no systemPrompt): it has no prompt template to seed.
    let promptInserted = 0;
    if (cfg.systemPrompt !== undefined) {
      const existingPrompt = await db
        .select({ id: aiPromptTemplateDefaults.id })
        .from(aiPromptTemplateDefaults)
        .where(
          and(
            eq(aiPromptTemplateDefaults.agentId, cfg.agentId),
            eq(aiPromptTemplateDefaults.variant, VARIANT),
          ),
        )
        .limit(1);
      if (existingPrompt.length === 0) {
        await db.insert(aiPromptTemplateDefaults).values({
          agentId: cfg.agentId,
          variant: VARIANT,
          version: 1,
          status: "active",
          systemPrompt: cfg.systemPrompt,
          userPromptTemplate: null,
          modelHint: MODEL_HINT,
          temperature: TEMPERATURE,
        });
        promptInserted = 1;
      }
    }

    // agent_policy_defaults (F1: UNIQUE(agent_id)) — idempotent. SKIPPED for an agent that
    // seeds NO policy (invoice_creator_v1): resolveAgentPolicy fail-safes to requiresReview:true.
    let policyInserted = 0;
    let policySeeded = false;
    if (cfg.policy !== undefined) {
      policySeeded = true;
      const existingPolicy = await db
        .select({ id: agentPolicyDefaults.id })
        .from(agentPolicyDefaults)
        .where(eq(agentPolicyDefaults.agentId, cfg.agentId))
        .limit(1);
      if (existingPolicy.length === 0) {
        await db.insert(agentPolicyDefaults).values({
          agentId: cfg.agentId,
          policy: cfg.policy,
          version: 1,
          status: "active",
        });
        policyInserted = 1;
      }
    }

    const promptStatus =
      cfg.systemPrompt === undefined ? "n/a (rule-based)" : promptInserted ? "inserted" : "already present";
    const policyStatus = !policySeeded
      ? "n/a (fail-safe gated)"
      : policyInserted
        ? "inserted"
        : "already present";
    console.log(`[seed:agent-config] ${cfg.agentId} — prompt: ${promptStatus}; policy: ${policyStatus}`);
  }

  // ── Targeted idempotent UPDATE — add tiebreakerMode to the EXISTING dispatch_router_v1 policy.
  // The AGENT_SEEDS loop is insert-if-absent, so it never touches an already-present row. Here we
  // re-read the stored policy (MariaDB returns json as a STRING → JSON.parse), and if it lacks the
  // key, write it back SPREAD-PRESERVING requiresReview (and any other keys). Idempotent: a row that
  // already has the key is logged and skipped.
  {
    const rows = await db
      .select({ policy: agentPolicyDefaults.policy })
      .from(agentPolicyDefaults)
      .where(eq(agentPolicyDefaults.agentId, "dispatch_router_v1"))
      .limit(1);
    if (rows.length === 0) {
      console.log("[seed:agent-config] dispatch_router_v1 tiebreakerMode — n/a (no policy row)");
    } else {
      const raw = rows[0].policy;
      const current = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
      if (current.tiebreakerMode !== undefined) {
        console.log(`[seed:agent-config] dispatch_router_v1 tiebreakerMode — already set: ${JSON.stringify(current)}`);
      } else {
        const next = { ...current, tiebreakerMode: "autonomy_only" };
        await db
          .update(agentPolicyDefaults)
          .set({ policy: next })
          .where(eq(agentPolicyDefaults.agentId, "dispatch_router_v1"));
        console.log(`[seed:agent-config] dispatch_router_v1 tiebreakerMode — set: ${JSON.stringify(current)} -> ${JSON.stringify(next)}`);
      }
    }
  }

  console.log("[seed:agent-config] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:agent-config] failed:", err);
    process.exit(1);
  });
