# Phase 6 — System Workflows

How notes, communications, the timeline, and the rewriter flow at runtime, and **why** each step is shaped the way it is. Mechanics-only descriptions live in `09-api-routes.md`; this file is about reasoning. Builds on the Phase 4 server-action → guard → mutate → audit shape, the Phase 5 dual-entity transaction + parent-before-child lock order (R-5.7), and the audit-rule split (R-4.5). Adds the **unifying communication log**, the **interleaved timeline**, and the platform's **first AI agent** running on a reusable substrate.

## WF-6.1 — Classify a note's visibility (classification ≠ sharing)
```
JobNoteForm → createJobNoteAction(jobId, prev, formData) → createJobNote({ ..., visibility })
  → getJob (JOB_NOT_FOUND) → INSERT job_notes (visibility, default internal_only)
  → writeAuditLog('job_note.created')   ← single-row write, OUTSIDE the txn (R-4.5)
```
**Why this shape:**
- *Visibility is a classification, not an action (D-6.24 / R-5.8):* picking `client_visible` records eligibility; it does **not** push the note anywhere. Sharing is the explicit WF-6.2 action. This preserves the explicit-workflow-transitions rule from Phase 5 — nothing leaves the system as a side effect of classifying.
- *One vocabulary, three sites (D-6.23):* the 5-value enum + `NoteVisibilityBadge` are shared across `job_notes`, `dispatch_messages`, and `communication_logs`; the picker reads the same constant.

## WF-6.2 — Share a note as a communication (SHARE-EXISTING)
```
ShareNoteButton (client) → shareNoteAction(jobId, noteId, audience) → shareNote({ tenantId, noteId, audience, sentByUserId })
  → getJobNote (NOTE_NOT_FOUND)
  → gate: client share needs visibility ∈ {client_visible, client_and_vendor_visible};
          vendor share needs ∈ {vendor_visible, client_and_vendor_visible}  → else NOTE_NOT_SHAREABLE
  → getJob (JOB_NOT_FOUND); resolve recipient (best-effort, pre-fill):
        client → client primary contact; vendor → the single-assignment vendor's primary contact (else unresolved)
  → channel = audience portal; visibility = AUDIENCE-DERIVED (client→client_visible, vendor→vendor_visible)
  → INSERT communication_logs (source_type='job_note', source_id=note.id, summary=note excerpt, delivery_status='draft')
  → writeAuditLog('communication.created')   ← single-row write, OUTSIDE the txn (R-4.5 by row-count)
```
**Why this shape:**
- *SHARE-EXISTING — the note is the content (D-6.5):* no new content row; the spine row points at the note via `source_type`+`source_id`. The `summary` is a create-time excerpt for the log/timeline; the full body stays on the note.
- *Audience-derived visibility (D-6.6):* a `client_and_vendor_visible` note shared to the vendor yields a **`vendor_visible`** comm — a communication goes to exactly one audience, so pass-through would mislabel it.
- *Share ≠ Send (D-6.7):* the comm starts at `delivery_status='draft'`; WF-6.3 advances it. Re-share is allowed (no uniqueness).
- *Single-row → `writeAuditLog` outside (R-4.5):* the distinguisher is **row count**, not the verb — `shareNote` writes one row, so audit goes outside the txn (vs the multi-row dispatch writes that audit inside).

## WF-6.3 — Advance a communication's delivery (the state machine)
```
DeliveryTransitionButtons (client) → updateDeliveryStatusAction(jobId, commId, toStatus)
  → getCommunication → isLegalDeliveryTransition(from, to)?  → else INVALID_DELIVERY_TRANSITION
  → UPDATE communication_logs.delivery_status (+ sent_at on 'sent', delivered_at on 'delivered')
  → writeAuditLog(`communication.${toStatus}`)   ← single-row, outside
```
**Why this shape:** the legal map (`draft → {sent,queued}`, `queued → sent`, `sent → {delivered,failed}`, `failed → sent`; terminals `delivered`/`bounced`/`received`) is shared client+server (`DELIVERY_TRANSITIONS`); the buttons render only legal next steps, and the server re-validates (never trust the client). `read_at` is independent of `delivery_status` (a delivered comm can be unread). (R-6.6.)

## WF-6.4 — Render the interleaved timeline
```
/jobs/[id] (server) → Promise.all([..., listJobEvents, listCommunicationsForJob, listJobNotes, listDraftsForJobDetailed])
  → timelineNotes = WF-6.5 filter
  → mergeTimeline(events, communications, timelineNotes)  → TimelineRow[]   (pure, no DB)
       rows sorted (createdAt ASC, sourceRank ASC): event(0) < communication(1) < note(2)
  → <JobTimeline rows={...} />  (client: All/Milestones/Communications/Notes filter, day-grouping, category accents)
```
**Why this shape:**
- *Unifying narrative (D-6.1):* `mergeTimeline` is to the timeline what `communication_logs` is to the data model — one chronological story from three sources. It's **pure** (re-sorts its inputs), so it's trivially testable.
- *Tie-break milestone→comm→note (D-6.9):* on a same-instant tie the milestone is the headline; time always wins over rank (a note 1 ms earlier than an event sorts first).
- *Category color is its own axis (R-6.9):* slate=milestone, indigo=communication, rose=note — deliberately **not** the status/visibility/delivery palettes, so the three categories stay legible without overloading semantic colors. Inline-SVG icons (no icon dependency).
- *Workspace-vs-narrative two-view (R-6.10):* a communication appears in **both** the Communications section (workspace — with delivery buttons) and the Timeline (read-only narration). Timeline rows have no click handler (Option B).

## WF-6.5 — The notes-in-timeline filter (page-side, visibility-aware) — closes acceptance #3
```
sharedNoteIds = { c.sourceId : c ∈ communications where c.sourceType='job_note' }
timelineNotes = notes.filter(n => n.visibility !== 'internal_only' AND !sharedNoteIds.has(n.id))
```
**Why this shape:** acceptance #3 ("timeline shows **notes**/events/status") was literally unmet by the 6c timeline (events + comms only). The rule (D-6.8): a note narrates **iff** it's not `internal_only` (internal stays workspace-only — the two-view model) **and** not yet shared (a shared note is its communication; showing both duplicates — the same dedup discipline the published-draft queue reuses). "Shareable-but-unshared" is the meaningful state surfaced. The filter is **page-side in-memory** at Phase 6 scale; a data-layer `unshared` filter is deferred (L-6.17). This was caught by the literal-acceptance review and fixed in batch **6c.1** rather than reinterpreted.

## WF-6.6 — The agent runner (the reusable substrate, §2.9)
```
openRun({ tenantId, agentId, jobId?, triggeredByUserId?, triggerSource, inputSummary })
   → INSERT agent_runs (status='running', started_at) → RunContext { runId, seq }
registerTool(ctx, tool) → returns a wrapper that runs the tool AND logs agent_tool_calls
   (success records output; failure records the error + re-throws)   ← auto-logged, sequenced
logDecision(ctx, { decisionType, proposedAction, reasoning, confidence, policyCheck, disposition, metadata })
   → INSERT agent_decisions
closeRun(ctx, { status: succeeded|failed, outputSummary?, model?, promptVersion?, inputTokens?, outputTokens? })
   → UPDATE agent_runs (status, completed_at, provenance)
```
**Why this shape:** this is the **inheritance vehicle** for Phases 7/8/13/16 (D-6.10). An agent declares tools and calls them through `registerTool`, so the read-broad/write-narrow audit (`agent_tool_calls`) comes for free. The substrate is generic — it supports both the v1 **fixed pipeline** (the rewriter) and future **LLM-native tool-use** (Phase 8) unchanged, because `registerTool` wraps any function regardless of who decides to call it. The substrate tables are immutable audit (no soft-delete `status`). Agent writes are recorded **here**, not in `audit_logs` (D-6.19).

## WF-6.7 — Run the rewriter (`update_rewriter_v1`, the first agent)
```
DraftClientUpdateButton (client) → draftClientUpdateAction(jobId, noteId) → runRewriter({ tenantId, jobId, noteId, triggeredByUserId })
  ctx = openRun(agent_id='update_rewriter_v1', triggerSource='operator_manual')
  try:
    note = getJobNote (read tool)            ┐
    job  = getJobDetail (read tool)          ├ read-BROAD, each auto-logged to agent_tool_calls
    assignments = listAssignmentsForJob (rt) ┘  → vendorNames
    { object, usage, model, promptVersion } = generateRewrite({ note, job, vendorNames })
        resolveRouting(): REWRITER_MOCK > AI_GATEWAY_API_KEY (gateway string) > ANTHROPIC_API_KEY (direct) > mock
        generateObject(model, schema=rewriteSchema, system=SYSTEM_PROMPT, prompt, temperature 0.3)
    logDecision('rewrite_proposal', reasoning=object.rationale, confidence=object.confidence,
                policyCheck='requires_review', disposition='queued_for_review',
                metadata={ strippedItems, rephrasings })
    createRewriteDraft (write tool — the ONE write; status='pending_review')   ← auto-logged
    closeRun(succeeded, model, promptVersion, inputTokens, outputTokens)
  catch e: closeRun(failed, errorMessage=e.message); throw   ← surfaced by the action, not thrown to the user
```
**Why this shape:**
- *Fixed pipeline, read-broad/write-narrow (D-6.12):* context in, transform, one draft out. The agent's only write is the draft at `pending_review` — it has **no path** to `communication_logs`/`client_update_logs`/job state (the §2.9 invariant, enforced structurally).
- *Policy is the publish gate, not the run (D-6.13):* the decision is always `queued_for_review` (Phase 6's hardcoded universal policy); the agent cannot publish.
- *Provenance per run (D-6.14/D-6.18):* `agent_runs` records `model` (provider-qualified for both gateway + direct), `prompt_version`, and `input/output_tokens` (from `usage.inputTokens`/`outputTokens`). The keeper run: 679 in / 232 out, ~11 s, ~$0.0055.
- *Errors are failure modes, not crashes:* an LLM timeout/rate-limit/parse-fail closes the run `failed` and surfaces inline; the operator re-triggers. Re-running a note creates a **new** draft (R-6.18).

## WF-6.8 — Review / edit / approve / reject / discard a draft
```
approve: approveDraftAction(jobId, draftId, prev, formData) → editedContent = (form value ≠ draft_content ? value : NULL)
         → createReview({ decision:'approve', editedContent })
reject:  rejectDraftAction(...) → require reviewNotes → createReview({ decision:'reject', reviewNotes })
discard: discardDraftAction(jobId, draftId) → discardDraft(tenantId, id, actorUserId)

createReview (txn):  lock draft FOR UPDATE → re-check pending_review → INSERT update_rewrite_reviews
                     → UPDATE draft.status = approved|rejected → tx.insert(audit_logs) (rewrite_draft.<status>)
discardDraft:        getDraft (guard pending) → UPDATE draft.status='discarded'
                     → writeAuditLog('rewrite_draft.discarded')   ← single-row, OUTSIDE
```
**Why this shape:**
- *`createReview` is a 2-row txn (D-6.15 / R-4.5):* review row + draft status advance are atomic, so the audit goes **inside**; the draft (parent) is locked `FOR UPDATE` and re-checked (concurrent-review race).
- *`edited_content` NULL when unchanged (D-6.15):* it carries information ("the operator changed something") only when an edit actually happened; `draft_content` stays immutable so the audit preserves "rewriter produced vs operator approved."
- *Discard is single-row → audit outside (R-4.5 / D-6.19):* it's an operator action on agent output, so it does hit `audit_logs` (`rewrite_draft.discarded`) — distinct from the agent's own writes, which don't.

## WF-6.9 — Publish an approved draft (the only draft → communication path)
```
PublishDraftButton (client) → publishDraftAction(jobId, draftId) → publishRewriteDraft({ tenantId, draftId, actorUserId })
  → getDraft (guard status='approved' → DRAFT_NOT_APPROVED); getJob; getApproveReviewForDraft → effective content
  → resolve recipient = client primary contact (pre-fill, R-5.11)
  → txn (parent-before-child, R-5.7):
       1. lock job FOR UPDATE        (re-check exists)
       2. lock draft FOR UPDATE      (re-check still 'approved' — double-publish race)
       3. INSERT client_update_logs (content = edited_content ?? draft_content, source_draft_id)
       4. INSERT communication_logs (source_type='client_update', source_id=cul.id, channel='client_portal',
                                      visibility='client_visible', delivery_status='draft', recipient pre-filled)
       5. UPDATE draft → status='published', published_communication_id = comm.id
       6. tx.insert(audit_logs) ×2: rewrite_draft.published + communication.created   ← INSIDE the txn
  → the published update now appears in Communications + the Timeline; Sent via the WF-6.3 machine
```
**Why this shape:**
- *The single human-gated path (D-6.13):* this is the **only** code that turns a draft into a client-facing communication, and it refuses anything not `approved`. The agent can never reach it.
- *Multi-row → parent-before-child + audit-inside (D-6.15 / R-5.7 / R-4.5):* lock the job then the draft, re-check both, write `client_update_logs` + `communication_logs` + the draft advance + two audit rows atomically.
- *Publish ≠ Send (D-6.7):* the comm lands at `delivery_status='draft'`; the operator Sends it afterward. The published draft leaves the Update-drafts queue (it *is* its communication now — the dedup discipline of WF-6.5 applied at the draft layer).
