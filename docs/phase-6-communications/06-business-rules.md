# Phase 6 — Business Rules

Rules introduced in Phase 6, each with the reasoning behind it. Inherits Phase 0–5 rules (source-agnostic, server-side DB access, tenant-scoping, `<entity>.<verb>` audit naming, parent-in-tenant guards, RESTRICT on reference FKs, the audit-inside-txn-vs-`writeAuditLog` split R-4.5, parent-before-child lock order R-5.7, explicit-workflow-transitions R-5.8, domain-verb events R-5.6, pre-fill discipline R-5.11, semantic status colors R-5.13). Phase 6 is where the **§2.9 agent-under-policy** posture becomes concrete code.

## R-6.1 — The unifying-log spine: `communication_logs : channels :: job_events : history
- One `communication_logs` row per communication, across every channel, linked to its content via polymorphic `source_type` + `source_id` (no FK — spans tables). `source_type` is a fixed 6-value enum locked up front (`dispatch_message`/`outbound_message`/`inbound_message`/`job_note`/`client_update`/`vendor_update`).
- **Why:** a single denormalized, orderable record of "everything communicated about this job," exactly mirroring how `job_events` is the denormalized milestone log. Per-channel timelines would fragment the story. (D-6.1/D-6.3.)

## R-6.2 — The delivery layer lives on the spine — supersedes Phase 5 R-5.15
- `delivery_status`, `sent_at`/`delivered_at`/`read_at`, and the recipient columns live on `communication_logs`, **not** on `dispatch_messages` (which stays content-only). Every channel shares one delivery model.
- **Why:** delivery is identical across channels; duplicating it per channel table would diverge. Phase 5 R-5.15 tentatively located it on `dispatch_messages` and deferred it — this **explicitly supersedes** that placement. (D-6.2.)

## R-6.3 — Recipient is polymorphic (`recipient_type` + `recipient_id`, no FK)
- `recipient_type` enum(`vendor_contact`,`client_contact`,`external`,`internal`,`none`) + `recipient_id` (no FK) + `recipient_email`/`phone`/`cc`/`bcc`. The recipient may span two contact tables or be external/none.
- **Why:** a single FK can't reference either contact table or an external party. `none` is structural (no Phase 6 use case — L-6.3). (D-6.4.)

## R-6.4 — Compose-vs-share: the spine points at exactly one content row, never duplicated
- SHARE-EXISTING (share a note) → spine points at the existing note (`source_type='job_note'`), **no new content row**. COMPOSE-NEW (ad-hoc message / rewriter publish) → a new content row + a spine row pointing at it. `summary` on the spine is a create-time excerpt; the full body is the content row.
- **Why:** the note *is* the content — copying it would duplicate and risk drift; new content needs its own row + provenance. (D-6.5.)

## R-6.5 — A communication's visibility is audience-derived, not the source's pass-through
- `shareNote(audience)` sets the comm's visibility from the audience (`client`→`client_visible`, `vendor`→`vendor_visible`), gated on the note's classification permitting that audience.
- **Why:** a communication goes to exactly one audience; a `client_and_vendor_visible` note shared to the vendor must yield a `vendor_visible` comm, not the broader source value. (D-6.6.)

## R-6.6 — The delivery state machine; `Share ≠ Send`, `Publish ≠ Send`
- Outbound `draft → {sent,queued}`; `queued → sent`; `sent → {delivered,failed}`; `failed → sent`; terminals `delivered`/`bounced`; inbound `received`. Sharing a note (6e) and publishing a rewrite draft (6g) both land at `draft`; the operator advances via the same machine. Buttons render only legal next steps; the server re-validates. `read_at` is independent of `delivery_status`.
- **Why:** creating/sharing/publishing a communication is distinct from transmitting it; operators review before send. A typed machine keeps illegal transitions out. (D-6.7.)

## R-6.7 — Audit-inside-vs-outside is decided by row count, NOT the action verb (sharpens R-4.5)
- Multi-row atomic writes (`createReview`, `publishRewriteDraft`) audit **inside** the txn (`tx.insert(audit_logs)`); single-row writes (`createJobNote`, `shareNote`, `updateCommunicationDeliveryStatus`, `discardDraft`) audit **outside** via `writeAuditLog`.
- **Why:** the rule is about transactional atomicity of the audit row with its siblings — a function of how many rows are written, not whether the verb sounds "important." (D-6.15/D-6.19; generalizes R-4.5/D-5.22.)
- **This sharpens R-4.5:** the original rule described "multi-row → audit inside; single-row → `writeAuditLog` outside" but didn't explicitly state the discriminator was *row count*. R-6.7 makes it explicit so future agents and workflows apply the rule by **counting rows**, not by judging action-verb importance. The same verb proves it: `communication.created` audits **outside** in `shareNote` (single-row) but **inside** the txn in `publishRewriteDraft` (multi-row) — same verb, either pattern, decided purely by row count.

## R-6.8 — A note narrates in the timeline iff (visibility ≠ internal_only) AND (not yet shared)
- The job page filters notes before `mergeTimeline`: drop `internal_only` (workspace-only), drop notes already shared as a communication (the comm represents them); the rest — including the meaningful "shareable-but-unshared" state — appear. Page-side, in-memory (Phase 6 scale).
- **Why:** closes the literal acceptance-#3 gap ("timeline shows **notes**") without breaking the workspace-vs-narrative model or duplicating shared content. (D-6.8; caught by the literal-acceptance review, fixed in 6c.1.)

## R-6.9 — Timeline category color is a dedicated axis; tie-break milestone→comm→note
- Category accents: **slate=milestone, indigo=communication, rose=note** — distinct from every semantic badge palette (status/visibility/delivery). Same-instant order: event(0) < communication(1) < note(2); time wins over rank. Icons are inline SVG (no icon dependency).
- **Why:** the category axis must be legible without overloading colors that already carry status/visibility meaning; the milestone is the headline of a shared instant. (D-6.9.)

## R-6.10 — Workspace-vs-narrative two-view model
- An entity can appear in **both** a workspace section (with actions — Notes, Communications, Update drafts) **and** the read-only Timeline narrative. The Timeline has no click handlers; actions live in the workspace sections.
- **Why:** operators act in the workspace; the timeline tells the story. Conflating them (clickable timeline rows) was considered and rejected (Option B). (D-6.9.)

## R-6.11 — Agent audit-substrate tables are immutable; they omit the soft-delete `status` enum
- `agent_runs`/`agent_tool_calls`/`agent_decisions` are append-only audit records (like `job_events`/`audit_logs`) — no `active/inactive/archived` status. `agent_runs.status` is the **run lifecycle** (`running`/`succeeded`/`failed`), not a soft-delete toggle. (The content tables `update_rewrite_drafts` [workflow status] and `client_update_logs` [soft-delete status] do carry status.)
- **Why:** you don't soft-delete an audit trail. (D-6.10.)

## R-6.12 — Agent actions are audited in the substrate; only operator actions hit `audit_logs`
- The agent creating a draft / logging tool calls / making decisions is fully captured by `agent_runs` + `agent_tool_calls` + `agent_decisions` — it writes **no** `audit_logs` row. The operator actions (review/approve/reject/discard/publish) **do** write `audit_logs`.
- **Why:** the substrate IS the agent's audit; an `audit_logs.rewrite_draft.created` row would be redundant and would conflate agent vs operator mutations. Phase 9+ cross-cutting audit unions both. (D-6.19; inherited by every future agent.)

## R-6.13 — Rewriter input is polymorphic; output is a single channel (`client_update_log`)
- Input is a polymorphic source (`source_type`+`source_id`): Phase 6 registers `job_note`; Phase 10+ adds `vendor_update_log` with no rewriter redesign. The published output is always a `client_update_logs` row → a `client_portal` communication.
- **Why:** decouples "what the rewriter reads" (pluralizes over time) from "what it produces" (one client-facing channel). Resolved Finding 2 (job_note vs vendor_update_log) as input pluralism rather than an either/or. (D-6.11.)

## R-6.14 — v1 agents use a fixed pipeline; the substrate also supports LLM-native tool-use
- The rewriter reads fixed context → transforms → writes one draft; `agent_tool_calls` logs each programmatic read/write. LLM-native tool-use (the model choosing its own tool calls) is supported by the same substrate but deferred to where it's needed (Phase 8 NTE negotiator).
- **Why:** the rewriter doesn't need autonomous tool selection; building it would be speculative. The runner abstraction supports either pattern unchanged. (D-6.12; L-6.15.)

## R-6.15 — Policy is enforced at the publish action; the agent has no path to operational state
- The agent writes only `update_rewrite_drafts` at `pending_review`. `publishRewriteDraft` is the only draft→communication path and refuses anything not `approved`. Phase 6 hardcodes `REWRITER_POLICY = { requiresReview: true }` (the seam for Phase 7 `agent_policies`).
- **Why:** §2.9 — agents never mutate operational state; review is mandatory. Making the gate structural (not a convention) means the agent *cannot* bypass it. (D-6.13.)

## R-6.16 — `agent_id` = `{name}_v{major}`; bump only on output-semantic change
- `update_rewriter_v1`. Bump the major on a model swap, behavior-changing prompt edit, or tool-surface change — **not** on cosmetic prompt edits or runner fixes. Finer provenance (`model`, `prompt_version`) lives per-run on `agent_runs`.
- **Why:** `agent_id` groups behaviorally-equivalent runs for analytics; semantic changes deserve a new id so dashboards don't conflate versions. (D-6.14.)

## R-6.17 — The rewriter is invokable on ANY note, regardless of visibility
- "Draft client update" appears on every note. `internal_only` notes are especially eligible (the whole point: internal content that needs sanitizing for the client).
- **Why:** visibility classifies *sharing* eligibility (R-5.8); it does not constrain *rewriter input*. The agent's job is transformation, not classification — and the human-review gate, not the note's visibility, is what protects the client. (Lock 5a.)

## R-6.18 — Re-running the rewriter creates a new draft (no block)
- Triggering the rewriter again on the same note produces a second `pending_review` draft (e.g. a different tone, or the source note changed).
- **Why:** operators legitimately want another attempt; blocking at the data layer would be paternalistic. (Lock 5b.)

## R-6.19 — MariaDB `json()` columns are parsed at the read boundary
- Any data-layer read exposing a json column (`agent_decisions.metadata`, `agent_tool_calls.tool_input`/`output`, `email_templates.applicable_channels`) must `JSON.parse` it — Drizzle's mysql json type writes stringified content but **returns the raw string on read** for MariaDB longtext. Writes are fine.
- **Why:** the failure is silent — a string-rendered-as-JSON instead of an object, so consumer UI renders empty/wrong (the rewriter's stripped-items list would have been blank). Detect with a probe type-check. (D-6.21; `reference-drizzle-sql-fragment-gotchas` #7; L-6.13.)

## R-6.20 — Registry entries carry `testOnly`; fixtures are excluded from tenant-facing enumeration
- `AGENT_REGISTRY` entries have `testOnly: boolean`. `listProductionAgents()` filters out `testOnly` entries. `test_stub_v1` is `testOnly: true`; `update_rewriter_v1` is `false`.
- **Why:** the committed test stub must exercise the substrate without ever surfacing to operators as an available agent (Phase 16 enumerates the registry). (D-6.20.)

## R-6.21 — Parent-before-child lock order reused for review + publish (R-5.7 generalized)
- `publishRewriteDraft` locks the job (parent) `FOR UPDATE`, then the draft (child), re-checks both; `createReview` locks the draft (parent) then writes the review (child).
- **Why:** the canonical multi-entity transaction pattern from Phase 5 — a single fixed lock order prevents deadlocks; re-checking under the lock catches double-publish / concurrent-review races. (D-6.15; R-5.7.)

## R-6.22 — Short explicit FK-prefix convention, extended per module
- FK + index names use short module prefixes to stay under MySQL's 64-char limit: `cl_`/`om_`/`im_`/`et_` (communications), `vul_`/`puq_` (update-engine forward-decls), `ar_`/`atc_`/`ad_`/`urd_`/`urr_`/`cul_` (agent substrate + rewriter I/O + client updates).
- **Why:** the long table names would push auto-generated FK names past 64 chars; the `db:generate` identifier guard enforces it. (Continues the Phase 5 `jva_`/`dm_`/… convention.)

## R-6.23 — Literal-acceptance-criterion review before closeout (meta-discipline)
- Before each phase's closeout, read the roadmap's acceptance lines **literally**, word by word, and compare to what was built. Every gap is either closed by implementation or documented as a deliberate interpretation — never silently glossed.
- **Why:** acceptance #3 ("timeline shows **notes**") was literally unmet by the 6c timeline; reading it literally surfaced the gap, closed by 6c.1. Silent acceptance-criterion gaps erode trust in the closeout claim. (See `11-closeout.md` for the Phase 6 review.)

## R-6.24 — One visibility vocabulary, reused not re-declared
- The 5-value visibility enum is identical across `job_notes`, `dispatch_messages`, and `communication_logs`; `NoteVisibilityBadge` + the picker read one vocabulary. Centralizing the literal into a single exported constant is a flagged DRY follow-up. (D-6.23; L-6.1.)
- **Why:** divergent re-declarations would let the three sites drift; they don't today, but the debt is logged.

## R-6.25 — The first functional dependency posture (external LLM)
- The stack goes pure-server+DB → +external LLM (`ai` v6 / Anthropic via gateway or direct). Failure modes (unavailable / rate-limited / timeout / parse-fail) all close the run `agent_runs.status='failed'` with `error_message`; the operator re-triggers. The no-UI-deps posture is unchanged (an LLM is functional, not a UI convenience).
- **Why:** marks the architectural inflection explicitly so resilience (Phase 9 analytics/monitoring of agent-run failure rates, Phase 13 retry queue) is planned, not assumed. (D-6.18; L-6.19.)

## R-6.26 — Minor code convention: non-hook predicates avoid the `use` prefix
- Boolean predicates / accessors that are **not** React hooks are named without a leading `use` (`shouldMock`, not `useMock`) — `react-hooks/rules-of-hooks` treats any `use*` identifier as hook-like and errors when it's called outside a component/hook.
- **Why:** a lint catch during 6g.b; cheap convention that avoids false hook-rule violations.
