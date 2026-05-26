# Phase 6 — API Routes & Server Actions

## Pages (under the authenticated `(app)` route group)
Phase 6 adds **no new routes** — everything lives as new **sections on the existing `/jobs/[id]` detail page** (server component). The page's `Promise.all` now loads contacts, notes, events, assignments, **communications** (`listCommunicationsForJob`), and **drafts** (`listDraftsForJobDetailed`), and builds `notesById` + the visibility-aware `timelineNotes` filter. New sections, in order: **Notes** (visibility badge + Share/Draft-client-update buttons), **Update drafts** (the rewriter queue), **Communications** (delivery buttons), **Timeline** (`<JobTimeline>` over `mergeTimeline`).

## Server actions (colocated under `jobs/`)
- **`shareNoteAction(jobId, noteId, audience)`** — `communication-actions.ts`. No extra params (bound; `useActionState`-compatible). Calls `shareNote`; maps `NOTE_NOT_FOUND`/`NOTE_NOT_SHAREABLE`/`JOB_NOT_FOUND`; `revalidatePath`.
- **`updateDeliveryStatusAction(jobId, commId, toStatus)`** — `communication-actions.ts`. Maps `COMMUNICATION_NOT_FOUND`/`INVALID_DELIVERY_TRANSITION`.
- **`draftClientUpdateAction(jobId, noteId)`** — `rewriter-actions.ts`. Calls `runRewriter`; **LLM/provider errors are caught and surfaced** (not thrown — the run is already recorded `failed`); maps `NOTE_NOT_FOUND`/`JOB_NOT_FOUND` + a generic `Rewriter failed: …`.
- **`approveDraftAction(jobId, draftId, prev, formData)`** — reads `editedContent` from `formData`; passes it **only when it differs** from `draft_content` (else NULL); `createReview(approve)`. *(formData is used → the preceding `prev` is fine under eslint `args:after-used`.)*
- **`rejectDraftAction(jobId, draftId, prev, formData)`** — requires `reviewNotes`; `createReview(reject)`.
- **`discardDraftAction(jobId, draftId)`** — `discardDraft`.
- **`publishDraftAction(jobId, draftId)`** — `publishRewriteDraft`; maps `DRAFT_NOT_APPROVED`/`DRAFT_NOT_FOUND`/`JOB_NOT_FOUND`.
All actions `requireTenant()` first; use `ctx.activeTenant.tenantId` + `ctx.user.id`; `revalidatePath('/jobs/[id]')`.

## Data layer (server-only modules)
- **`src/server/job-notes.ts`** — `createJobNote(visibility)` (6b); `getJobNote` (6e); `listJobNotes` left-joins users for `authorName` (6c.1, exports `JobNoteListItem`).
- **`src/server/communications.ts`** (6e) — `shareNote` (SHARE-EXISTING, audience-derived visibility, recipient pre-fill, single-row + `writeAuditLog` outside), `listCommunicationsForJob` (joined `sentByName`, exposes `source_id` for the timeline dedup), `updateCommunicationDeliveryStatus` (state-machine-validated), `getCommunication`.
- **`src/lib/timeline.ts`** (6c/6c.1) — `mergeTimeline(events, communications, notes)` → `TimelineRow[]` (pure; 3-kind discriminated union; tie-break event<comm<note).
- **`src/server/agents/runner.ts`** (6g.a) — `openRun`/`logToolCall`/`logDecision`/`closeRun`/`registerTool` (the shared substrate; auto-logs each tool call).
- **`src/server/agents/registry.ts`** (6g.a) — `AGENT_REGISTRY` (+ `testOnly`), `listProductionAgents()`.
- **`src/server/agents/runs.ts`** — `getRun`/`listRunsForJob`/`listRunsForAgent`/`getRunTrace`.
- **`src/server/agents/drafts.ts`** — `getDraft`/`listDraftsForJob`/`listPendingReviewDrafts`/`createRewriteDraft` (the agent write — NOT `audit_logs`)/`discardDraft` (single-row + `writeAuditLog('rewrite_draft.discarded')`)/`listDraftsForJobDetailed` (joins the decision; **parses the json `metadata`** at the read boundary).
- **`src/server/agents/reviews.ts`** — `getReview`/`listReviewsForDraft`/`getApproveReviewForDraft`/`createReview` (2-row txn: lock draft → review + advance + audit inside).
- **`src/server/client-updates.ts`** — `getClientUpdate`/`listClientUpdatesForJob`/**`publishRewriteDraft`** (multi-row txn, parent-before-child, the only draft→comm path).
- **`src/server/agents/update-rewriter/`** — `index.ts` (`AGENT_ID`, `runRewriter`), `prompt.ts` (`SYSTEM_PROMPT`, `buildUserPrompt`, `PROMPT_VERSION`), `tools.ts` (the 3 read + 1 write `AgentTool`s), `llm.ts` (`resolveRouting`, `generateRewrite`, `rewriteSchema`, the `REWRITER_MOCK` stub).
- **`src/server/agents/test-stub/index.ts`** — `test_stub_v1` (committed, LLM-free substrate test agent).

## Components
- `NoteVisibilityBadge` (6b — shared, 5-value), `DeliveryStatusBadge` (6e — vocab + transition map `DELIVERY_TRANSITIONS`/`isLegalDeliveryTransition`), `ConfidenceBadge` (6g.b — high=green/med=blue/low=amber).
- `ShareNoteButton`, `DeliveryTransitionButtons` (6e — `useActionState`), `DraftClientUpdateButton` (6g.b — on every note row).
- `JobTimeline` (6c — "use client": filter pills, day-grouping, inline-SVG icons, category accents, `suppressHydrationWarning` on relative time).
- `UpdateDraftsSection` (6g.b — "use client": Pending review / Ready to publish / Dismissed sub-sections; inline review/edit/approve/reject/discard; one-click publish with the pre-fill summary). Imports `DraftListItemDetailed` as a **type** from the server module (`import type` erases the server-only import).

## Conventions reinforced / added
- `requireTenant()` at the top of every action; single-row writes → `writeAuditLog` outside, multi-row → audit inside (R-4.5 by row-count, R-6.7).
- **Parent-before-child lock order (R-5.7)** reused for `createReview` + `publishRewriteDraft`.
- **The agent runner (R-6.x)** is the reusable substrate; **agent writes audit to the substrate, operator actions to `audit_logs`** (R-6.12).
- **No-extra-param** server actions stay `useActionState`-compatible; where `formData` *is* read (approve/reject), the unused `prev` precedes the used `formData` (eslint `args:after-used`, so it's not flagged).
- **Zero new top-level routes**; the first **external service dependency** (the LLM) is isolated behind `llm.ts` + `resolveRouting` + `REWRITER_MOCK`.

## Forward pointers
- **Phase 6.5** adds the compose-new + inbound-logging actions/UI on `outbound_messages`/`inbound_messages`.
- **Phase 7** swaps the hardcoded `REWRITER_POLICY` for `agent_policies` lookups (the publish gate is the seam) and adds the scope-generator agent on the same runner.
- **Phase 8** adds the NTE negotiator — likely the first **LLM-native tool-use** agent (the runner supports it unchanged).
- **Phase 13** adds the real send pipeline (delivery transitions actually transmit) + email-parser-populated `inbound_messages` + possibly async/background runs.
