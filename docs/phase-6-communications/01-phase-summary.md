# Phase 6 — Phase Summary

## Phase Name
Notes, Communication, and Update Engine

## Version
`v0.7.0-phase-6`

## Phase Goal
Make a job's notes, communication history, and AI-assisted client updates first-class: classify note visibility, log every communication on a single unifying spine, interleave milestones + communications + notes into one rich timeline, and ship the platform's **first AI agent** — the vendor→client update rewriter — operating under the §2.9 draft-then-review-then-publish discipline on a reusable agent substrate that Phases 7/8/13/16 inherit.

## In Scope
- **Note visibility classification (6b):** a 5-value vocabulary (`internal_only`/`vendor_visible`/`client_visible`/`client_and_vendor_visible`/`requires_review`) + picker + `NoteVisibilityBadge`. Classification ≠ sharing (R-6.x).
- **Communication schema (6d):** `communication_logs` — the **unifying-log spine** (one row per communication across all channels, via polymorphic `source_type`+`source_id`), with the **delivery layer on the spine** (superseding Phase 5 R-5.15) + `outbound_messages` + `inbound_messages` + `email_templates`. Migration `0010`.
- **Share-display-delivery loop (6e):** `shareNote` (SHARE-EXISTING — the note IS the content, audience-derived visibility), the Communications section, and the delivery state machine (`Share ≠ Send`).
- **Rich interleaved timeline (6c + 6c.1):** `mergeTimeline` folds `job_events` (milestones) + `communication_logs` + a curated slice of `job_notes` into one chronological narrative; visibility-aware notes filter closes acceptance #3.
- **Update-engine forward-decls (6f):** `vendor_update_logs` + `portal_update_queue` (schema-only). Migration `0011`.
- **Agent substrate (6g.a):** `agent_runs`/`agent_tool_calls`/`agent_decisions` (generic) + `update_rewrite_drafts`/`update_rewrite_reviews` + `client_update_logs` + the shared **runner** + a committed **test stub**. Migration `0012`.
- **The rewriter (6g.b):** `update_rewriter_v1` — a real LLM agent (`generateObject` via the AI gateway / direct Anthropic) with the trigger / draft-queue / review-edit-approve / publish UI. The project's **first functional non-UI dependency** (`ai`, `zod`, `@ai-sdk/anthropic`).

## Out of Scope (deferred)
- **Ad-hoc compose + inbound-logging UI → Phase 6.5** (`6e.5`). The roadmap lists no compose-UI deliverable or acceptance criterion; 6d met the schema deliverable, 6e met "communications tied to jobs." (L-6.6.)
- **Per-client `agent_policies`** (which clients require review / allow auto-publish) → **Phase 7.** Phase 6 hardwires a universal "rewriter drafts always require review" policy; the `REWRITER_POLICY` constant is the seam. (L-6.12.)
- **`agent_drafts` unification** (shared vs specialized) → **Phase 7**, decided with the scope generator as the second data point. (L-6.11.)
- **`vendor_update_logs` / `portal_update_queue` activation** → Phases 10/12/13 (vendor portal / client portal / send pipeline). Schema-only in Phase 6. (L-6.5.)
- **`email_templates` render/send pipeline** → Phase 13; **LLM-native agent tool-use** → Phase 8; **async/background rewriter runs** → Phase 13. (L-6.7/L-6.15/L-6.8.)

## Status
Complete. Branch `phase-6-communications`, tag `v0.7.0-phase-6`. Builds on Phase 5 (`v0.6.0-phase-5`). All ten literal §8 acceptance criteria met — criteria 6–9 are the rewriter/agent lines codifying the §2.9 invariants (the literal-acceptance review is in `11-closeout.md`); the one literal gap found mid-phase (acceptance #3 "timeline shows **notes**") was closed by batch 6c.1 rather than reinterpreted.

## Pointers
- Decisions: `02-decisions.md` (D-6.1 … D-6.25)
- The "why" behind the flows: `05-system-workflows.md`, `06-business-rules.md`
- Chatbot source-of-truth: `07-chatbot-knowledge.md`
- DB changes (migrations 0010–0012): `08-db-changes.md` · API/actions: `09-api-routes.md`
- Known limitations + carry-forwards: `10-known-limitations.md`
- Closeout + the literal-acceptance review: `11-closeout.md`
