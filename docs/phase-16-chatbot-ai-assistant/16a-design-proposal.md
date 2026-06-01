# Phase 16 — 16a Design Proposal (Forks Framed, NOT Resolved)

**Purpose:** frame the consequential decisions for Jonny ahead of 16b. Each fork states the
options, the empirical evidence from the inspection sweep, and the trade-offs — **no decision is
taken here.** Backing facts live in `16a-inspection-report.md`.

Phase 16 is the **Chatbot & AI Operations Assistant** — the final roadmap phase. The assistant
READS across domains and DRAFTS via existing agents; it must not become a new operational table
family (see WP-16.1).

---

## F16-A — Knowledge-retrieval model

**The question:** when an operator asks the assistant a question, where does the assistant's
knowledge of the platform come from?

- **(a) Load docs at query time** — read the curated `07-chatbot-knowledge.md` layer (or the
  whole docs tree) into the prompt context per query.
- **(b) Index / RAG table** — build an embeddings/retrieval table, chunk + embed docs, retrieve
  top-k per query.
- **(c) Curated `07-chatbot-knowledge.md` layer** — treat the existing 16-file knowledge layer
  as the single authored knowledge source, loaded wholesale.

**Deciding empirical input (from Step 4):**
- Full docs tree: **224 files / 17,694 lines / 2.1 MB** — the upper bound.
- Curated knowledge layer: **16 × `07-chatbot-knowledge.md` = 878 lines total** — small.
- **No embedding/RAG/vector infrastructure exists** (`embedding` grep: zero hits — Step 9).

**Trade-offs:**
- (c) at 878 lines fits comfortably in a single model context with room to spare — no index,
  no new table, no chunking, and the knowledge layer is already authored + maintained per phase.
- (a) loading the *whole* tree (17.7k lines) is heavier per query and mixes operator-facing
  knowledge with internal build docs (decisions, closeouts) not meant for end users.
- (b) RAG is the only option that scales past context limits, but it introduces net-new
  infrastructure (embeddings table, ingestion job, a provider for embeddings) — the heaviest lift,
  and unjustified at the current 878-line size. Tension with WP-16.1 (new table family).

*(Empirics strongly shrink the problem; the choice between (a)/(c) and whether to seed (b) for
future scale is Jonny's.)*

---

## F16-B — AI-provider reuse + the `ai_action_logs` question

**The question:** how does the chatbot reach an LLM, and where do its actions get logged?

**Provider reuse — how (from §1.1):** the assistant reuses the Phase-7 seam exactly:
- `resolveAgentRouting({ mockEnvVar, modelEnvVar, defaultGatewayModel, defaultDirectModel })`
  from `src/server/agents/llm-routing.ts` — gives it the same mock/gateway/direct precedence,
  Vercel AI Gateway or `@ai-sdk/anthropic`, env-only config, per-agent model override.
- If the assistant DRAFTS (e.g. an update or a scope), it runs through the shared **runner**
  (`openRun → registerTool → logDecision → closeRun`) so its run, tool calls, and decision land
  in `agent_runs / agent_tool_calls / agent_decisions` for free — same as every other agent.
- Prompt config via `ai_prompt_templates` + `resolveActivePrompt` (a new `agent_id` for the
  assistant, fail-closed).

**The logging fork — extend `audit_logs` vs new `ai_action_logs` (from §6):**
- **Extend `audit_logs`:** columns already exist (`action`, `target_type`, `target_id`,
  `metadata`, `actor_label`); an `actor_label='assistant'` row needs zero new schema. Fits the
  "human + actor action" stream; swallow-on-failure is fine for a side log.
- **Reuse the `agent_*` substrate:** if the assistant's every action is an agent run, the
  provenance (run id, model, prompt version, tokens, confidence, disposition) is ALREADY captured
  by the runner — arguably no `ai_action_logs` table is needed at all.
- **Dedicated `ai_action_logs`:** only justified if the assistant performs actions that are
  neither agent runs nor human-attributable audit rows (e.g. pure read/answer turns we still want
  to log) AND we want them out of both existing streams.

*(Roadmap §9 named `ai_action_logs`; it does not exist. Whether Phase 16 creates it, extends
`audit_logs`, or rides `agent_*` is deferred to Jonny. See WP-16.1.)*

---

## F16-C — draft → review → outbound chain

**The question:** when the assistant DRAFTS something outbound, what lands it and what gates it?

- Roadmap §9 named a `ai_generated_updates` landing table (**absent** — Step 5).
- The platform already has the §2.5 review-gate pattern proven twice:
  - **Scope:** `job_scope_drafts` (pending_review) → `job_scope_reviews` (approve/reject) →
    human-gated `publishScopeDraft` → `job_scope_steps` (§1.2).
  - **Update rewriter:** `update_rewrite_drafts` → `update_rewrite_reviews` → operator publish to
    client portal (§2.9).
  - The Snow analog: declare → dispatch → **confirm** (`src/server/snow/confirm-dispatches.ts`).

**Fork:** does the assistant get its OWN landing table (`ai_generated_updates`-style) with its own
review gate, or does it route every draft type into the EXISTING domain draft table for that type
(a scope draft → `job_scope_drafts`, an update draft → `update_rewrite_drafts`)? The latter reuses
proven review gates and keeps the assistant a thin orchestrator; the former centralizes
assistant-originated drafts but risks duplicating the review machinery. The PM-approve /
Snow-confirm analog is the precedent either way: **draft is never auto-sent; a human confirms.**

---

## F16-D — engine-vs-UI boundary

**The question:** what is "Phase 16 the service layer" vs "Phase 16 the chat UI"?

Mirrors the B-14.4 (PM) / B-15.3 (Snow) engine-then-portal split.

- **Service layer = Phase 16 core:** retrieval (knowledge + tenant-scoped readers), draft
  orchestration (via existing agents/runner), and logging. Server-only, harness-tested, no UI.
- **Chat UI = operator-portal surface:** the conversational front-end (likely an App Router route
  group + the `ai` SDK streaming primitives). Candidate for a later sub-batch, the same way the
  vendor/client portals followed their engines.

**Fork:** confirm the boundary — does 16b build only the service layer (retrieval/draft/logging)
with the chat UI deferred to a later sub-batch, matching the engine-first phases? Or is a minimal
chat surface in-scope for the first implementation batch?

---

## F16-E — harness shape for a READ/DRAFT surface

**The question:** what does the Phase-16 verification harness assert? (mirrors the
`scripts/check-*.ts` pattern — §4).

Proposed assertions to lock (framing, not final):
- **Retrieval correctness:** a known question retrieves the expected knowledge doc(s) / reader
  output.
- **Draft is logged + NOT auto-sent:** a drafted artifact lands at `pending_review` (or its
  domain equivalent) and produces an `agent_runs`/decision row; no outbound side effect fires.
- **Action logging:** every assistant action is captured (wherever F16-B lands it).
- **Cross-tenant isolation:** retrieval for tenant A never returns tenant B's rows — exercised
  against the `requireTenant` / `activeTenant.tenantId` guard and the vendor/client scope sets
  (§5).

**Fork:** which of these are blocking gates for 16b closeout vs later-batch coverage.

---

## WP-16.1 — scope guard (the load-bearing constraint)

The assistant **READS and DRAFTS across existing domains**. It must NOT spawn a new operational
table family under "the assistant needs it." The only candidate net-new tables surfaced by the
roadmap (`ai_generated_updates`, `ai_action_logs`, `ai_scope_generation_logs`) are each
**already covered by existing substrate** (`job_scope_drafts` / `update_rewrite_drafts`,
`audit_logs` or `agent_*`, and `agent_runs/_tool_calls/_decisions` respectively). Any proposal to
create a new table in Phase 16 must first show why the existing draft / audit / agent substrate
cannot carry it. This guard frames F16-B and F16-C: **default to reuse; net-new schema is the
exception that must justify itself.**
