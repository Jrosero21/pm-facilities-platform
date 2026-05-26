# Phase 6 — Decisions

Decisions locked in during Phase 6. Builds on Phase 0–5 decisions. The phase spans note visibility, a unifying communication log, a rich timeline, an update-engine substrate, and the platform's first AI agent — so the set is large and several decisions are §2.9-load-bearing (every future agent inherits them). Each notes the rule/limitation it creates where relevant (cross-linked to `06-business-rules.md` / `10-known-limitations.md`).

## D-6.1 — Communication data model = a unifying log spine (Option B)
- **Why:** Communications arrive on many channels (notes shared to portals, ad-hoc emails, inbound messages, dispatch messages, client/vendor updates). Modelling each as its own table with its own timeline would fragment "what was communicated about this job." A single denormalized spine — exactly what `job_events` is for milestones — gives one queryable, orderable record.
- **How to apply:** `communication_logs` is the spine: one row per communication, pointing at its channel-detail content row via polymorphic `source_type` + `source_id` (no FK — spans tables). It does **not** restructure Phase 5 `dispatch_messages`; that table becomes one of the spine's source types. (R-6.1.)

## D-6.2 — The delivery layer lives on the spine, NOT on `dispatch_messages` — supersedes R-5.15
- **Why:** Phase 5 (R-5.15) deferred the delivery layer (recipient routing, send/bounce/read) and tentatively located it on `dispatch_messages`. Once the unifying spine exists (D-6.1), delivery is a spine concern — every channel needs the same `delivery_status`/`sent_at`/`delivered_at`/recipient fields, so they belong once on `communication_logs`, not duplicated per channel table.
- **How to apply:** `communication_logs` carries `delivery_status`, `sent_at`/`delivered_at`/`read_at`, and the recipient columns. `dispatch_messages` stays content-only. **This explicitly supersedes Phase 5 R-5.15's tentative placement.** (R-6.2.)

## D-6.3 — `source_type` is a fixed 6-value polymorphic enum, locked up front
- **Why:** The spine discriminator will be hit by share (6e), compose (6e.5), inbound (6e.5), and the rewriter publish (6g) paths. Locking the full vocabulary now avoids enum `ALTER`s across 6e/6f/6g.
- **How to apply:** `source_type` enum = `dispatch_message`, `outbound_message`, `inbound_message`, `job_note`, `client_update`, `vendor_update`. The original 6d proposal had 3 values; it was expanded to 6 (flagged before generating the migration) to cover the share + update paths. (R-6.1.)

## D-6.4 — Recipient is polymorphic (`recipient_type` + `recipient_id`, no FK)
- **Why:** A communication's recipient may be a client contact, a vendor contact, an external party (email/phone only), an internal log entry, or none — spanning two contact tables. A single FK can't express that.
- **How to apply:** `recipient_type` enum(`vendor_contact`,`client_contact`,`external`,`internal`,`none`) + `recipient_id` (no FK) + `recipient_email`/`recipient_phone`/`cc`/`bcc`. `none` is structural (no Phase 6 use case — L-6.3). (R-6.3.)

## D-6.5 — Compose-vs-share: the spine points at exactly one content row, never duplicates
- **Why:** Two creation modes exist. SHARE-EXISTING (share a note) must not copy the note's body into a new content row — the note *is* the content. COMPOSE-NEW (ad-hoc message, or a rewriter-published update) creates new content. Conflating them would either duplicate content or lose provenance.
- **How to apply:** SHARE-EXISTING → spine row with `source_type='job_note'`, `source_id`=the note id, no new content row. COMPOSE-NEW → a new content row (`outbound_messages` / `client_update_logs`) + a spine row pointing at it. `summary` on the spine is a create-time excerpt for the timeline; the full body lives in the content row. (R-6.4.)

## D-6.6 — A shared communication's visibility is audience-derived, not pass-through
- **Why:** A note classified `client_and_vendor_visible` shared to *one* audience must yield a communication scoped to *that* audience only — a communication goes to one audience. Passing the note's broader visibility through would mislabel the comm.
- **How to apply:** `shareNote(audience)` derives the comm's visibility from the audience (`client`→`client_visible`, `vendor`→`vendor_visible`), gated on the note's visibility permitting that audience. (R-6.5.)

## D-6.7 — Delivery state machine; `Share ≠ Send`, `Publish ≠ Send`
- **Why:** Creating/sharing/publishing a communication is distinct from *sending* it. Operators review before a comm leaves the system. A typed state machine keeps illegal transitions out.
- **How to apply:** outbound `draft → {sent, queued}`; `queued → sent`; `sent → {delivered, failed}`; `failed → sent`; terminals `delivered`/`bounced`; inbound = `received`. Share (6e) and Publish (6g) both land at `delivery_status='draft'`; the operator advances via the same machine. (R-6.6.)

## D-6.8 — Notes appear in the timeline iff (visibility ≠ internal_only) AND (not yet shared)
- **Why:** Acceptance #3 says the timeline shows "notes." But the workspace-vs-narrative model argues `internal_only` notes (operator workspace) don't belong in the narrative, and a *shared* note is already represented by its communication — duplicating it would confuse. The "shareable-but-unshared" state is genuinely narrative ("we wrote a client note, haven't sent it").
- **How to apply:** the job page filters notes: drop `internal_only`; drop any note whose id is a `source_id` of a `source_type='job_note'` communication; pass the rest to `mergeTimeline`. Filter is **page-side / in-memory** (Phase 6 scale; a data-layer `unshared` filter is deferred). This is the **6c.1** fix that closed the acceptance-#3 gap. (R-6.8.)

## D-6.9 — Timeline tie-break event<comm<note; category accents are their own color axis
- **Why:** Same-instant rows need a deterministic order, and the three categories need to be visually distinguishable without overloading the status/visibility/delivery palettes (which already carry meaning).
- **How to apply:** `sourceRank` event(0) < communication(1) < note(2); sorted `(createdAt ASC, sourceRank ASC)`. Category accents are a dedicated axis — **slate=milestone, indigo=communication, rose=note** — chosen distinct from every semantic badge palette. (R-6.9; the workspace-vs-narrative two-view is R-6.10.)

## D-6.10 — Agent substrate = 3 generic immutable-audit tables + specialized rewriter I/O
- **Why:** §2.9 requires every agent to write `agent_runs`/`agent_tool_calls`/`agent_decisions`. These are audit records (like `job_events`/`audit_logs`) — immutable, no soft-delete. The rewriter's own I/O (`update_rewrite_drafts`/`update_rewrite_reviews`) is agent-specific and stays separate so the substrate remains generic.
- **How to apply:** `agent_runs`/`agent_tool_calls`/`agent_decisions` carry **no soft-delete `status` enum** (`agent_runs.status` is the run lifecycle running/succeeded/failed). The 3 substrate tables + the runner are inherited by Phases 7/8/13/16; the rewrite tables are not. (R-6.11.)

## D-6.11 — Rewriter input is a polymorphic source (job_note now; vendor_update_log later); output is always a client_update_log
- **Why:** "Finding 2" — does the rewriter consume `vendor_update_logs` (A) or vendor `job_notes` (B)? §2.9's example and acceptance #6 both say "vendor **note**." There's no vendor portal in Phase 6, so the operator records the vendor's report as a note. But the *output* is a client-facing update, which is a `client_update_log`.
- **How to apply:** `update_rewrite_drafts.source_type` enum(`job_note`,`vendor_update`); Phase 6 registers only `job_note`; Phase 10+ adds `vendor_update` via the same contract with **no rewriter redesign**. The publish path always writes a `client_update_logs` row. This reframed Finding 2 from A-vs-B to "input pluralism, single output channel." (R-6.13.)

## D-6.12 — The v1 rewriter is a fixed pipeline, not LLM-native tool-use; read-broad/write-narrow
- **Why:** The rewriter is a single transform (assemble context → rewrite → write draft); it doesn't need the model to autonomously choose tools. LLM-native tool-use is a Phase 8 (NTE negotiator) concern. But the *substrate* must support both.
- **How to apply:** `runRewriter` calls fixed read tools then a fixed write tool, each registered through the runner (auto-logged to `agent_tool_calls`). Read tools: `getJobNote`, `getJobDetail`, `listAssignmentsForJob` (broad context). Write tool: `createRewriteDraft` only — never `job_status`/`job_events`/`communication_logs`/`client_update_logs` directly. (R-6.14; L-6.15.)

## D-6.13 — Policy enforcement is the publish action; the agent has no path to operational state
- **Why:** §2.9 — agents never mutate operational state; drafts require review. The gate must be structural, not a convention the agent could bypass.
- **How to apply:** the agent writes only `update_rewrite_drafts` at `pending_review`. `publishRewriteDraft` (a separate, human-initiated action) refuses unless the draft is `approved`. Phase 6 hardcodes `REWRITER_POLICY = { requiresReview: true }` (the seam where Phase 7 `agent_policies` plugs in). There is no agent → communication path. (R-6.15; L-6.12.)

## D-6.14 — `agent_id` = `{name}_v{major}`, bumped only on output-semantic change
- **Why:** `agent_id` groups behaviorally-equivalent runs for analytics. A model swap / behavior-changing prompt edit / tool-surface change is a new behavior; a cosmetic prompt tweak is not.
- **How to apply:** `update_rewriter_v1`. Bump the **major** on output-semantic change only. Finer provenance — `model`, `prompt_version` — lives per-run on `agent_runs`. (R-6.16.)

## D-6.15 — Publish is a multi-row txn (parent job → child draft); `edited_content` lives on the review, `draft_content` is immutable
- **Why:** Publishing writes a `client_update_logs` row + a `communication_logs` spine row + advances the draft — a multi-row atomic write. The audit trail must distinguish "what the rewriter produced" from "what the operator approved."
- **How to apply:** `publishRewriteDraft` reuses the **parent-before-child** lock order (R-5.7): lock the job `FOR UPDATE`, then the draft, re-check both, then write all rows + audit **inside** the txn. The operator's edit is stored as `update_rewrite_reviews.edited_content` (NULL when unchanged — D-6.x); the draft's `draft_content` never changes; effective published content = `edited_content ?? draft_content`. (R-6.21.)

## D-6.16 — Specialized `update_rewrite_drafts` now; `agent_drafts` unification deferred to Phase 7
- **Why:** The rewriter's draft has domain columns (source pointer, publish link). A shared polymorphic `agent_drafts` table with a single consumer is premature abstraction.
- **How to apply:** ship `update_rewrite_drafts` specialized. Phase 7's scope generator gives the second data point; its design revisits shared-vs-specialized. Not decided for Phase 7 here. (L-6.11.)

## D-6.17 — `vendor_update_logs` + `portal_update_queue` are schema-only forward-decls (split batch, not folded into 6g.a)
- **Why:** They are roadmap §8 Phase 6 core tables but have no Phase 6 writer (no portals until Phases 10/12/13). Folding them into 6g.a's migration would mix "active substrate" with "forward-decls"; a thin separate 6f batch keeps each migration's intent coherent and the 6h docs clean.
- **How to apply:** migration `0011` creates the two tables (no data layer, no UI). The "basic update queue concept" deliverable is realized in Phase 6 by the **rewriter draft queue** (`update_rewrite_drafts` at `pending_review`); `portal_update_queue` is its eventual portal-push home. (L-6.5.)

## D-6.18 — First functional non-UI dependency: `ai` v6, gateway-preferred with direct-Anthropic fallback
- **Why:** An LLM is a functional necessity, not a UI convenience — so the no-UI-deps posture doesn't apply. Per platform guidance, prefer a gateway provider string over a provider-specific package, but a user with only a direct Anthropic key must still work.
- **How to apply:** `ai`@6 + `zod`@4 + `@ai-sdk/anthropic`@3. `resolveRouting()` picks, in precedence: `REWRITER_MOCK=1` → mock (wins over keys); `AI_GATEWAY_API_KEY` → gateway string `"anthropic/claude-sonnet-4-6"`; `ANTHROPIC_API_KEY` → direct `anthropic("claude-sonnet-4-6")`; none → mock. (The first cut checked both keys in the mock gate but only implemented gateway routing — a direct-key user failed at call time; fixed in `6g.b-fix`.) `agent_runs.model` records the provider-qualified form for both paths. (R-6.25; L-6.9.)

## D-6.19 — Agent actions are audited in the substrate, NOT in `audit_logs`; operator actions hit `audit_logs`
- **Why:** The substrate (`agent_runs` + `agent_tool_calls` + `agent_decisions`) fully records what the agent did. Adding `audit_logs` rows for agent writes would be redundant and conflate agent vs operator actions.
- **How to apply:** `createRewriteDraft` (agent write) writes **no** `audit_logs` row — it's captured in `agent_tool_calls`. The operator actions — review/approve/reject/discard/publish — **do** write `audit_logs` (`rewrite_draft.approved`/`.rejected`/`.discarded`/`.published`, `communication.created`). Phase 9+ cross-cutting audit unions the substrate + `audit_logs`. (R-6.12.)

## D-6.20 — Registry entries carry a `testOnly` flag; test fixtures are excluded from tenant-facing enumeration
- **Why:** A committed test stub agent (`test_stub_v1`) exercises the substrate without an LLM — but it must never surface to operators as an "available agent" (Phase 16's chatbot enumerates the registry).
- **How to apply:** `AGENT_REGISTRY` entries have `testOnly: boolean`; `listProductionAgents()` filters `testOnly` out. `update_rewriter_v1` is `false`, `test_stub_v1` is `true`. (R-6.20.)

## D-6.21 — MariaDB `json()` columns are parsed at the read boundary
- **Why:** On MariaDB a Drizzle `json()` column is physically `longtext`; mysql2 returns it as a **string**, and Drizzle's mysql json type does not parse on read. A naive `(row.col as T).field` is silently `undefined`.
- **How to apply:** any data-layer read exposing a json column `JSON.parse`s it (`listDraftsForJobDetailed` parses `agent_decisions.metadata`). Writes are fine. Detected by a probe type-check (string vs object) — it would have shipped a silently-empty stripped-items list. (R-6.19; L-6.13.)

## D-6.22 — `REWRITER_MOCK` gates a deterministic stub at the LLM boundary (dev/probe workflow)
- **Why:** Real LLM calls cost tokens; routine dev iteration and the verification probe must run without them. Distinct from `test_stub_v1` (which tests the *substrate*) — this mocks the *rewriter's own* LLM boundary so its tools/prompt-assembly/draft pipeline are testable.
- **How to apply:** `REWRITER_MOCK=1` (or no key configured) → `generateRewrite` returns a deterministic object. The real call is exercised only in operator-driven QA + production. (Operational guidance: `04-admin-sop.md` SOP-6.E.)

## D-6.23 — The 5-value visibility vocabulary is one shared constant, reused (not re-declared) across three sites
- **Why:** `job_notes` (Phase 4/6b), `dispatch_messages` (Phase 5), and `communication_logs` (6d) all use the same visibility values. `NoteVisibilityBadge` renders any of them.
- **How to apply:** the values are identical across all three declarations; the badge + picker read one vocabulary. Centralizing the literal into a single shared constant is a worthwhile DRY follow-up flagged but not done (the values don't drift today). (L-6.1.)

## D-6.24 — Setting a note's visibility is classification only, never sharing
- **Why:** Per R-5.8 (explicit-workflow-transitions), classifying a note `client_visible` must not silently push it to the client. Visibility describes eligibility; sharing is a deliberate action.
- **How to apply:** `createJobNote(visibility)` stores the classification and writes no communication. The explicit **Share** action (6e) is what creates a communication. (Generalizes R-5.8 explicit-workflow-transitions; the flow is WF-6.1.)

## D-6.25 — Ad-hoc compose + inbound logging deferred to Phase 6.5
- **Why:** The roadmap lists no compose-UI deliverable or acceptance criterion; the schema deliverable was met by 6d and "communications tied to jobs" by 6e's share path. Compose is operator convenience, not an acceptance gate.
- **How to apply:** `6e.5` (compose-new form, channel-aware, recipient routing, inbound logging) is deferred. The schema (`outbound_messages`/`inbound_messages`) already supports it. (L-6.6.)
