# Phase 6 Closeout — Notes, Communication, and Update Engine

## Phase Goal
Make a job's notes, communication history, and AI-assisted client updates first-class: classify note visibility; log every communication on one unifying spine with a delivery state machine; interleave milestones + communications + notes into a rich timeline; and ship the platform's first AI agent — the vendor→client update rewriter — under the §2.9 draft-then-review-then-publish discipline, on a reusable agent substrate that Phases 7/8/13/16 inherit.

## Completed Deliverables
- **Note visibility (6b):** 5-value classification + picker + `NoteVisibilityBadge`; classification ≠ sharing.
- **Communication schema (6d, migration 0010):** `communication_logs` unifying spine (delivery layer on the spine — supersedes R-5.15) + `outbound_messages` + `inbound_messages` + `email_templates`.
- **Share-display-delivery (6e):** `shareNote` (SHARE-EXISTING, audience-derived visibility), the Communications section, the delivery state machine (`Share ≠ Send`).
- **Rich timeline (6c) + notes-in-timeline (6c.1):** `mergeTimeline` (events + communications + curated notes), visibility-aware notes filter.
- **Update-engine forward-decls (6f, migration 0011):** `vendor_update_logs` + `portal_update_queue` (schema-only).
- **Agent substrate (6g.a, migration 0012):** `agent_runs`/`agent_tool_calls`/`agent_decisions` + `update_rewrite_drafts`/`update_rewrite_reviews` + `client_update_logs` + the shared runner + the committed `test_stub_v1`.
- **The rewriter (6g.b):** `update_rewriter_v1` — real LLM (gateway/direct routing, `REWRITER_MOCK`) + trigger/draft-queue/review-edit-approve/publish UI. First functional dependency (`ai`/`zod`/`@ai-sdk/anthropic`).
- All 11 Phase 6 docs.

## Literal-Acceptance-Criterion Review (R-6.23 — every §8 Phase 6 acceptance line, read literally)
All **ten** rows below are literal bullets from the roadmap's §8 Phase 6 **"Acceptance criteria:"** block (lines 924–935 of `docs/roadmap/01-gpt-project-roadmap.md`) — verified by re-reading the source. Criteria **6–9** are the rewriter/agent acceptance lines: they codify the §2.9 "agents operate under policy, draft-then-review" invariants *as* §8 acceptance criteria for Phase 6's first AI agent (line 933 cites §2.9 explicitly). They are literal §8 acceptance lines, not separately-derived. (The §8 **Deliverables** block, lines 910–922, is separate — its "basic update queue concept" and "per-client rewriter policy hooks" are addressed under "two deliverables met by interpretation" below.)

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Operator can add notes to job | ✅ | `createJobNote` (Phase 4 + 6b visibility) |
| 2 | Notes have visibility | ✅ | 5-value enum + picker + badge (6b) |
| 3 | Job timeline shows **notes**/events/status changes | ✅ | events+status via `job_events`; **notes via 6c.1** — see gap below |
| 4 | Client/vendor visibility is controlled | ✅ | classification (6b) + audience-gated share (6e) |
| 5 | Communication records can be tied to jobs | ✅ | `communication_logs.job_id` (6d/6e) |
| 6 | Vendor notes can generate a client-ready draft via the rewriter | ✅ | `update_rewriter_v1` keeper demo (stripped $750/NTE/vendor name) |
| 7 | Rewriter drafts never auto-published unless explicit per-client policy allows | ✅ | structural — agent has no publish path; `requiresReview` hardcoded; the "auto-publish" branch never fires in Phase 6 |
| 8 | Rewriter draft generation logged in `agent_runs`/`agent_tool_calls`/`agent_decisions` | ✅ | the keeper chain (1 run + 4 tool_calls + 1 decision) |
| 9 | Operator can edit and approve a draft before it becomes a client-visible communication | ✅ | review/edit/approve → `publishRewriteDraft` |
| 10 | Phase docs updated | ✅ | this set |

**The one literal gap, caught and closed (not reinterpreted):** acceptance #3 says the timeline shows **notes**. The 6c timeline rendered only events + communications. Reading the line literally (R-6.23) surfaced the gap → **batch 6c.1** added a visibility-aware notes layer (R-6.8) rather than quietly reinterpreting "notes" to mean "shared notes." This is the discipline's worked example for all future closeouts.

**Two deliverables met by interpretation (documented, not silent):**
- *"basic update queue concept"* — realized in Phase 6 by the **rewriter draft queue** (`update_rewrite_drafts` at `pending_review`, surfaced in the Update drafts section). `portal_update_queue` is the structural forward-decl for the eventual portal-push queue (Phase 12/13). (D-6.17/L-6.5.)
- *"per-client rewriter policy hooks"* — the **enforcement seam** exists (`REWRITER_POLICY` at the publish gate); full **per-client configurability** is `agent_policies`, deferred to **Phase 7** (the 6a lock). Phase 6 ships the universal "always require review" policy. (D-6.13/L-6.12.)

## Files Created or Changed
- Schema: `communications.ts`, `portal-updates.ts`, `agents-substrate.ts`, `agents-rewriter.ts`, `client-updates.ts`; updated `job-details.ts` (note visibility) + `index.ts`.
- Migrations: `0010` (communications), `0011` (update-engine forward-decls), `0012` (agent substrate) + meta.
- Data layer: `communications.ts`, `agents/runner.ts`, `agents/registry.ts`, `agents/runs.ts`, `agents/drafts.ts`, `agents/reviews.ts`, `client-updates.ts`, `agents/update-rewriter/{index,prompt,tools,llm}.ts`, `agents/test-stub/index.ts`; additions to `job-notes.ts` (visibility, `getJobNote`, `authorName`).
- `src/lib/timeline.ts` (pure `mergeTimeline`).
- Actions: `jobs/communication-actions.ts`, `jobs/rewriter-actions.ts`.
- UI: `note-visibility-badge.tsx`, `delivery-status-badge.tsx`, `confidence-badge.tsx`, `share-note-button.tsx`, `delivery-transition-buttons.tsx`, `draft-client-update-button.tsx`, `job-timeline.tsx`, `update-drafts-section.tsx`; new sections on `jobs/[id]/page.tsx`.
- Deps: `ai`@6, `zod`@4, `@ai-sdk/anthropic`@3.
- Docs: `docs/phase-6-communications/01..11`.

## Database Changes
See `08-db-changes.md`. 12 new tables across 3 migrations (0010 communications · 0011 update-engine forward-decls · 0012 agent substrate). Delivery layer on the spine (supersedes R-5.15); polymorphic `source_type`+`source_id` + recipient; audit-substrate tables immutable (no soft-delete status); 0012 has 18 FKs + 11 explicit indexes (21 incl. FK-backing); MariaDB json columns parse-at-read. Total recorded migrations: **13**.

## API Routes / Server Actions Added
See `09-api-routes.md`. No new routes — new sections on `/jobs/[id]`; 7 server actions (share, delivery, draft/approve/reject/discard/publish); the agent runner + rewriter modules + the communications/drafts/reviews/client-updates data layer.

## User-Facing Workflows Added
See `03-user-sop.md`, `05-system-workflows.md`: classify a note's visibility; share a note (audience-gated); advance delivery; read the interleaved timeline; draft a client update with the rewriter; review/edit/approve/reject/discard; publish to the client.

## Admin/Internal Workflows Added
Apply migrations 0010–0012; verify the 18 agent-substrate FK rules + explicit indexes; the JSON read-parse gotcha; the `REWRITER_MOCK` dev workflow + key provisioning (gateway vs direct); the committed test-stub substrate test; inspect the keeper agent chain (`04-admin-sop.md`).

## Business Rules Added
See `06-business-rules.md` R-6.1…R-6.26: unifying-log spine (R-6.1), delivery-on-spine supersedes R-5.15 (R-6.2), polymorphic recipient (R-6.3), compose-vs-share one-content-row (R-6.4), audience-derived visibility (R-6.5), delivery state machine (R-6.6), audit-by-row-count (R-6.7), notes-in-timeline rule (R-6.8), timeline category axis (R-6.9), workspace-vs-narrative (R-6.10), immutable substrate (R-6.11), agent-actions-in-substrate (R-6.12), polymorphic-input/single-output (R-6.13), fixed-pipeline-vs-tool-use (R-6.14), policy-at-publish (R-6.15), agent_id convention (R-6.16), rewriter-on-any-note (R-6.17), re-run-new-draft (R-6.18), MariaDB-json-parse (R-6.19), registry testOnly (R-6.20), parent-before-child reuse (R-6.21), FK-prefix convention (R-6.22), literal-acceptance review (R-6.23), one-visibility-vocab (R-6.24), first-functional-dependency (R-6.25), non-hook-naming (R-6.26).

## Chatbot Knowledge Added
See `07-chatbot-knowledge.md` K-6.1…K-6.14: the communication spine, note visibility + sharing, the delivery machine, the interleaved timeline + notes rule, the agent substrate + runner, the rewriter + draft lifecycle + publish path, the §2.9 policy bounding, LLM integration, the audit model, the Job #2 keeper chain, and the "do not claim" list.

## Verification Performed
```bash
pnpm lint         # clean
pnpm exec tsc --noEmit  # exit 0
pnpm build        # clean
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 13
# 6b: note visibility classification probe.
# 6d: communication schema — FK rules, enums, JSON longtext.
# 6e: shareNote/delivery probe (share→draft; audience-derived visibility; state machine).
# 6c/6c.1: mergeTimeline probe (tie-break event<comm<note; visibility-aware notes filter; Job #2 real data). [10/10]
# 6f: 0011 forward-decls — 2 tables empty, FK rules. [8/8]
# 6g.a: substrate — 18 FKs, 9 enums, 11 explicit indexes (+10 FK-backing), JSON longtext; stub-agent chain + publish txn, mutate-restore. [24/24]
# 6g.b: rewriter under REWRITER_MOCK — pipeline (4 tool_calls), approve(edited)+publish, reject, discard; mutate-restore. [20/20]
#       routing — REWRITER_MOCK/gateway/direct/none branch selection + REWRITER_MODEL override. [7/7]
# Keeper (operator-driven, REAL Sonnet 4.6): Job #2 requires_review note → draft (679 in/232 out tokens, high
#       confidence, 4 stripped items) → approve as-is → publish. Persisted: full agent chain + 2nd communication.
#       [all ephemeral probe scripts deleted; committed test-stub retained]
```

## Known Limitations
See `10-known-limitations.md` L-6.1…L-6.19. Highlights: visibility-enum 3× DRY debt (L-6.1); one-shot rewriter (L-6.2); 6f forward-decls structural-only (L-6.5); compose+inbound → 6.5 (L-6.6); ~11 s sync latency (L-6.8); model-string normalization (L-6.9); `agent_drafts` unification deferred (L-6.11); per-client policy deferred (L-6.12); MariaDB-json-read systemic parse (L-6.13); no role-gate on publish (L-6.14); LLM-native tool-use deferred (L-6.15); first external dependency (L-6.19).

## Carry-Forward Items
- **Phase 6.5:** compose-new + inbound-logging UI (6e.5); the systemic MariaDB-json custom type; visibility-enum extraction.
- **Phase 7:** `agent_drafts` shared-vs-specialized decision; per-client `agent_policies` (replacing the `REWRITER_POLICY` seam); `ai_prompt_templates`; the scope-generator agent on the runner; role-gating.
- **Phase 8:** the NTE negotiator — likely the first LLM-native tool-use agent.
- **Phase 9:** agent cost/run analytics; model-string normalization.
- **Phase 10/12/13:** activate `vendor_update_logs` / `portal_update_queue` / `email_templates` rendering / `inbound_messages` parsing; the real send pipeline; async/background rewriter runs; LLM monitoring (Phase 9).

## Recommended Next Phase Focus
**Phase 7 — AI-Assisted Scope Generation** (`v0.8.0-phase-7`). It is the first inheritor of the Phase 6 agent substrate. Orient on what Phase 7 **inherits** vs what's **genuinely new**:
- **Inherits from Phase 6:** the **agent runner** (`openRun`/`registerTool`/`logDecision`/`closeRun`) + `agent_runs`/`agent_tool_calls`/`agent_decisions`; the **draft-then-review-then-publish** gate (R-6.15) + the agent-has-no-path-to-state invariant (§2.9); the **agent-actions-in-substrate** audit model (R-6.12); the **`agent_id` versioning** + provenance convention (R-6.16); the **registry + `testOnly`** pattern (R-6.20); the **LLM integration** shape (`resolveRouting`, gateway/direct, `REWRITER_MOCK`, structured `generateObject`); and the **parent-before-child** publish transaction (R-6.21).
- **Genuinely new in Phase 7:** the **`agent_policies`** table (per-tenant/per-client policy — replacing the hardcoded `REWRITER_POLICY`); the **`agent_drafts` unification** decision (shared vs specialized, now with a second agent as the data point); **`ai_prompt_templates`** (DB-stored, versioned prompts vs Phase 6's in-code `prompt.ts`); and the scope-generator's own tool surface + output target (`job_scope_steps`).
- **Reuse** the pre-fill discipline (R-5.11), the semantic palettes, the no-extra-param action pattern, the MariaDB-json read-parse rule (R-6.19), and the literal-acceptance-criterion review (R-6.23) at Phase 7 closeout.

**Phase 7 entry point:** start the next chat with **"Start Phase 7."** The project memory pointer will reflect Phase 6 complete + the fresh `phase-7-scope-generation` branch off `main`. Phase 7 begins with a 6a-equivalent **design proposal (no code)** for the scope generator's substrate decisions:
- shared vs specialized `agent_drafts` (decided now with the scope generator as the second data point);
- `ai_prompt_templates` shape (DB-stored, versioned prompts, replacing Phase 6's in-code `prompt.ts`);
- the per-client `agent_policies` plug-in mechanism (replacing the `REWRITER_POLICY` constant at the publish gate);
- the scope generator's tool surface + output target (`job_scope_steps`).

Do not ship any Phase 7 schema or implementation before that design proposal locks. Same gate rhythm as 5a / 6a / 6g.
