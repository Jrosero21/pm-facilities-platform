# Phase 18 — System Workflows

## Workflow 18.A — Cross-job AI-draft triage (Drafts tab)

```
agent run → createRewriteDraft(pending_review)        [existing, Phase 6/16]
                     │
   /review?tab=drafts (Server Component, requireTenant)
                     │
   listPendingReviewDraftsDetailed(tenantId)           [NEW reader]
     update_rewrite_drafts (status IN pending_review, approved)
       ⟕ agent_decisions (confidence/rationale, on agent_run_id, rewrite_proposal)
       ⟗ jobs ⟗ clients (label: #jobNumber · clientName)
                     │
   ReviewQueueSection (per row binds the row's OWN jobId)
                     │
   ┌─ Pending review ─ Approve → approveDraftAction → createReview(approve)  → status approved
   │                   Reject  → rejectDraftAction  → createReview(reject)   → status rejected
   │                   Discard → discardDraftAction → discardDraft           → status discarded
   └─ Ready to publish ─ Publish → publishDraftAction → publishRewriteDraft  → status published
                                     (writes client_update_logs + communication_logs — existing path)
```
All transition writers are **existing** (Phase 6/16); Phase 18 adds only the cross-job reader + the
queue UI. The draft chain remains `create(agent, pending_review) → review(human) → publish(human) →
send(human)`.

## Workflow 18.B — Vendor-update capture → review → promotion (Vendor updates tab)

```
vendor portal: createVendorNote → createJobNote(origin='vendor', visibility='internal_only')  [existing]
                     │   (lands in job_notes — captured, NOT client-visible: §2.3-v1/§2.4-v1)
                     │
   /review?tab=vendor-updates (Server Component, requireTenant)
                     │
   listVendorUpdates(tenantId)                          [NEW reader]
     job_notes WHERE origin='vendor' AND status<>'archived'
       ⟕ users (authorName)  ⟗ jobs ⟗ clients (label)
                     │
   VendorUpdatesInbox — for internal_only / requires_review rows, a Promote control
                     │
   promoteNoteVisibilityAction(jobId, noteId) [requireTenant → actorUserId]
                     │
   promoteNoteVisibility({tenantId, noteId, toVisibility, actorUserId})   [NEW writer]
     1. getJobNote(tenantId, noteId)            → NOTE_NOT_FOUND if missing/cross-tenant
     2. target check (client_visible | client_and_vendor_visible)
                                                → INVALID_PROMOTION_TARGET otherwise
     3. capture from = note.visibility
     4. UPDATE job_notes SET visibility=to      (single row; updated_at via onUpdateNow)
     5. writeAuditLog('job_note.visibility_promoted', {jobId, from, to})
     ── NO communication_logs · NO client_update_logs · NO notification (Fork 1) ──
                     │
   revalidatePath('/review') + revalidatePath('/jobs/{jobId}')
```

## Workflow 18.C — Dual-mode groundwork (documented, not built)

The queue lane container is structured to host a future **"acted autonomously — inspect/undo"** lane
alongside "awaiting approval". Phase 18 renders only the awaiting-approval lanes; the autonomous lane
has no producer until the policy engine (Phase 23). No status enum value was added.
