# Phase 16 — Phase Summary

**Phase:** 16 — Chatbot & AI Operations Assistant (the final roadmap phase).
**Branch:** `phase-16-chatbot-ai-assistant` (off `main@33cd741`).
**Outcome:** a READ/DRAFT operations assistant layered over the whole platform — **service
layer only**, ZERO new tables, regression-protected by a 37-assertion phase-blocking harness.

## What Phase 16 is

`chatbot_assistant_v1` is a production agent (registered in `src/server/agents/registry.ts`,
surfaced by `listProductionAgents()`) that runs through the **shared agent runner**
(`openRun → registerTool → … → closeRun`). It answers operator questions over the platform's
authored knowledge, summarizes/triages operational data, and **drafts** outbound updates — but
it never publishes, sends, or mutates operational state. Every action is logged to the existing
`agent_*` audit chain; every draft lands at `pending_review` behind the §2.5 human gate.

## The 10 tools (all in `src/server/agents/chatbot-assistant/`)

**Knowledge (platform-level, 2):**
- `searchKnowledge(query)` — keyword search over the 16 curated `07-chatbot-knowledge.md` files
  (878 lines), returning excerpts **with source-doc paths** for citation. No embeddings/RAG.
- `readDoc(path)` — on-demand full-doc fetch, **allowlisted to `docs/` `.md` only** via the
  `resolveDocPath` path guard (`doc-access.ts`).

**Operational reads (tenant-scoped, 6):** `summarizeJob`, `identifyStalledJobs`,
`identifySlaRisks`, `flagInvoiceAnomalies`, `summarizeVendorPerformance`, `recommendNextAction`
— each **composes existing Phase-8/9 readers** (no new SQL/readers), threading the run's
`tenantId` captured in a closure (the caller never supplies it → structural isolation).

**Drafts (tenant-scoped writes, 2):** `draftClientUpdate(jobId)` / `draftVendorFollowUp(jobId)`
— land a `pending_review` row in `update_rewrite_drafts` via the **existing**
`createRewriteDraft` writer; the agent has **no publish path**.

## Schema posture — ZERO new tables, ZERO migrations

The phase reuses the existing substrate entirely (table count unchanged at **115**; latest
migration unchanged at **0041**):
- **Logging:** `agent_runs` / `agent_tool_calls` / `agent_decisions`.
- **Drafts + §2.5 gate:** `update_rewrite_drafts` (+ `update_rewrite_reviews`, the human review).
- **AI provider/prompt:** `ai_prompt_templates` / `ai_prompt_template_defaults` (reused from Phase 7).

## Commits (6)

`af8368f` planning (16a/16b) · `c67909e` agent registration (16c) · `cc7c9d8` knowledge tools
(16d) · `f9117e8` operational read tools (16e) · `ba15455` draft tools (16f) · `6c38c21` harness
(16g). Closeout docs (16h) land in the following commit.

## Verification

`pnpm run db:check:chatbot-assistant` — **37/0 GREEN on two clean runs** (groups A–F:
knowledge+guard / job-summary / draft-gate / agent_* logging / cross-tenant poison /
write-boundary). See `11-closeout.md`.

## Scope guard held (WP-16.1)

The assistant reads and drafts across domains and added **no new operational table family**.
The roadmap §9 `ai_action_logs` / `ai_generated_updates` names were superseded by the live
`agent_*` + `update_rewrite_drafts` substrate (see `08-db-changes.md` / `16h-roadmap-completion.md`).
