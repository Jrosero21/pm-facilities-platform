# Phase 16 — Closeout

## Goal

Deliver the **Chatbot & AI Operations Assistant** (the final roadmap phase): a READ/DRAFT
assistant layered over the whole platform, as a **service layer** with **zero new tables**,
reusing the §2.5 draft-vs-act gate and the `agent_*` logging substrate.

## Completed deliverables

- `chatbot_assistant_v1` registered as a production agent, running through the shared runner.
- **10 tools:** 2 knowledge (`searchKnowledge`, `readDoc`), 6 tenant-scoped operational reads
  (`summarizeJob`, `identifyStalledJobs`, `identifySlaRisks`, `flagInvoiceAnomalies`,
  `summarizeVendorPerformance`, `recommendNextAction`), 2 draft writes (`draftClientUpdate`,
  `draftVendorFollowUp`).
- A security path guard (`resolveDocPath`) allowlisting all filesystem access to `docs/` `.md`.
- A 37-assertion phase-blocking harness, green on two clean runs.

## Files created / changed (commits `c67909e` → `6c38c21`; planning `af8368f`)

- `src/server/agents/registry.ts` — registered `chatbot_assistant_v1` (16c, `c67909e`).
- `src/server/agents/chatbot-assistant/` — `index.ts` (run + `bindTools`), `doc-access.ts`
  (path guard), `knowledge.ts` + `tools.ts` (knowledge, 16d `cc7c9d8`), `operational-tools.ts`
  (6 reads, 16e `f9117e8`), `draft-tools.ts` (2 drafts, 16f `ba15455`).
- `scripts/check-chatbot-assistant.ts` + `package.json` alias `db:check:chatbot-assistant`
  (16g, `6c38c21`).
- `docs/phase-16-chatbot-ai-assistant/` — planning (16a/16b) + this closeout set (16h).

## DB changes

**ZERO.** Table count 115 (unchanged); latest migration 0041 (unchanged); next free 0042
untouched. Reused `agent_*`, `update_rewrite_drafts`/`update_rewrite_reviews`, `ai_prompt_templates`.
See `08-db-changes.md` (incl. the §9 `ai_*` correction).

## Workflows

Run lifecycle (`openRun → registerTool → closeRun`, all logged); knowledge retrieval + citation;
the draft chain `create(agent, pending_review) → review(human) → publish(human) → send(human)`.
See `05-system-workflows.md`.

## Business rules

R-16.1…R-16.8, each mapped to a harness group. See `06-business-rules.md`.

## Chatbot knowledge added

`07-chatbot-knowledge.md` — the assistant's self-description (its tools, the draft gate, what it
will not do). `searchKnowledge` now reads 16 knowledge docs (this is the 16th area to gain one;
the assistant can describe itself).

## Verification

```
pnpm run db:check:chatbot-assistant
→ passed: 37 / failed: 0  — PHASE-BLOCKING LEDGER GREEN ✓   (run twice, identical; idempotent)
```
Groups: A knowledge+guard · B job-summary · C draft-gate · D agent_* logging · E cross-tenant
poison · F write-boundary. `pnpm exec tsc --noEmit` → exit 0.

## Known limitations

Deterministic draft text (B-16.5); no chat UI (B-16.3); no vendor-direction publish target
(B-16.3); no vendor performance reader / empty scores table (B-16.4); no invoice aging (CF-16.2);
`source_id` polymorphic meaning (CF-16.3); RAG-if-corpus-outgrows-context. See `10-known-limitations.md`.

## Carry-forward items

New: B-16.3, B-16.4, B-16.5, CF-16.1, CF-16.2, CF-16.3, RAG-if-outgrows. Plus the full inherited
post-MVP bank rolled forward verbatim. See `closeout-carryforwards.md` — the canonical backlog.

## Next focus

**There is no next phase — Phase 16 is the final roadmap phase.** See
`16h-roadmap-completion.md` for the full-platform inventory, the §9 correction, and recommended
post-roadmap directions. The roadmap (Phase 0–16) is **complete at `v2.0.0-phase-16`** pending the
gated close (push / tag / merge), which is handled separately after this closeout review.
