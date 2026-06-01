# Phase 16 — Decisions

Locked forks (framed in `16a-design-proposal.md`, resolved at the manifest/inspection gates)
plus the implementation-time resolutions. Each with its rationale.

## F16-A — Knowledge-retrieval model: curated layer, query-time load + `readDoc`

**Decision:** retrieval = the 16 curated `07-chatbot-knowledge.md` files (878 lines) loaded at
query time via keyword search, **plus** a `readDoc(path)` tool for on-demand full-doc fetch.
**No RAG / embeddings.**

**Why:** the curated layer is only 878 lines — small enough to scan/load within model context
with room to spare. RAG would introduce net-new infrastructure (embeddings table, ingestion
job, an embeddings provider) unjustified at this size and in tension with WP-16.1. If the
curated layer ever outgrows context, RAG is banked (see `closeout-carryforwards.md`).

## F16-B — AI-action logging: `agent_*`, not `ai_action_logs`

**Decision:** AI actions log via the existing shared runner audit chain
(`agent_runs` / `agent_tool_calls` / `agent_decisions`). **No `ai_action_logs` table.**
`audit_logs` stays reserved for human-driven domain-mutation events.

**Why:** the runner already captures run + per-tool I/O + decision provenance (model, prompt
version, tokens, disposition) — richer than `audit_logs`. The roadmap §9 `ai_action_logs` name
described a table that the Phase-6/7 `agent_*` substrate already supersedes. Reuse over net-new
(WP-16.1).

## F16-C — Draft landing: reuse `update_rewrite_drafts`, ZERO migration

**Decision:** both draft tools land a `pending_review` row in `update_rewrite_drafts` via the
existing `createRewriteDraft` writer. **No new table, no migration.**

**Why (from `16a-inspection-report.md` / 16f-A):** `update_rewrite_drafts` already satisfies the
three slot criteria — a `status` enum defaulting `pending_review` (the gate), `agent_run_id`
NOT NULL (agent-authored origin; the chatbot is a distinct `agent_id`), and a polymorphic
`source_type('job_note','vendor_update')` already covering both draft directions. Create and
publish are separate, human-gated paths; the agent is structurally unable to publish.

## F16-D — Engine-vs-UI boundary: service layer only

**Decision:** Phase 16 = the service layer (agent + tools + draft-landing + logging + harness).
The **chat UI is deferred** to the operator-portal phase.

**Why:** mirrors the B-14.4 (PM) / B-15.3 (snow) engine-first split — the durable, testable
service substrate lands first; the React surface follows with the rest of the operator-portal
bank. Banked as B-16.3.

## F16-E — Harness shape

**Decision:** `scripts/check-chatbot-assistant.ts` (run `pnpm run db:check:chatbot-assistant`),
sandbox-only hard-exit guard, destructive + self-seeding off the phase-9 seed, assertion groups
A–F. Mirrors `check-snow-dispatch.ts`.

**Why:** matches the established phase-blocking-harness convention exactly (no parallel shape);
groups map 1:1 to the phase's business rules (see `06-business-rules.md`).

## Implementation-time resolutions

- **`summarizeVendorPerformance` scope-cut (16e-A):** there is **no per-vendor activity reader**
  and `vendor_performance_scores` is empty/unpopulated. The tool returns **profile + a "not
  scored yet" note** — not a performance score. Building the reader + populating the table is
  banked (B-16.4). *Why:* WP-16.1 forbids inventing new query logic under "the assistant needs it."
- **Invoice-anomaly rules = exactly two (16e-B):** (A) negative margin (`getJobMargin < 0`);
  (B) NTE breach (Σ approved vendor invoices `>` `notToExceedAmount`). **Invoice aging excluded**
  (banked CF-16.2). *Why:* both rules compose existing readers; aging needs a new metric/threshold.
- **`source_id = jobId` (16f):** the assistant drafts *from a job*, so the job is the draft's
  source. *Why:* simplest binding satisfying the NOT NULL `source_id`; the chatbot's `agent_id`
  already distinguishes its drafts from the rewriter's. The polymorphic-meaning nuance is
  documented (CF-16.3); an optional intent-tag enum value is banked (CF-16.1).
- **Deterministic draft text (16f):** draft prose is composed deterministically from job facts;
  **LLM phrasing deferred** (B-16.5). *Why:* keeps the write path deterministic and testable this
  phase; phrasing is an additive later slice that does not change the gate.
- **Structural tenant isolation via closure (16e/16f):** operational + draft tools are factories
  capturing `ctx.tenantId` (and `ctx.runId` for drafts), so the model-driven caller supplies only
  the entity id and can never target a foreign tenant. *Why:* makes group-E isolation a
  property of the binding, not of caller discipline.
