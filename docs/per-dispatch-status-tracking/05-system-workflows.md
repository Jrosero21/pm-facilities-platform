# Per-Dispatch Status Tracking — System Workflows

## Operator hand-advance (`setAssignmentStatus`)

```
operator picks a status on the assignment page
  → setAssignmentStatusAction (requireTenant → tenantId + ctx.user.id)
  → setAssignmentStatus({ tenantId, assignmentId, toCode, actorUserId, note? }):
      reject DRAFT/SENT (STATUS_NOT_OPERATOR_SETTABLE)
      resolve toCode → status id (STATUS_NOT_FOUND if missing)
      tx:
        SELECT … FOR UPDATE the assignment (ASSIGNMENT_NOT_FOUND)
        read current status code as `from`
        if current == to  → NO-OP (return changed:false, no writes)
        UPDATE job_vendor_assignments.current_status_id = to       (pure status set)
        INSERT job_vendor_assignment_status_history (from → to, changedBy = operator, note)
        applyDispatchJobFollow(tx, …)                              ← the auto-follow
        INSERT audit { action: job_vendor_assignment.status_set, actor: operator, via: operator_console, fromCode, toCode }
  → revalidate /jobs/{jobId}/dispatch/{assignmentId} + /jobs/{jobId}
```

## Vendor transition (`performTransition`) — unchanged, plus the follow

```
vendor portal action (accept / decline / confirmEta / confirmSchedule / markOnSite / markWorkComplete)
  → performTransition(input, fromCode, toCode, …):
      tx:
        SELECT … FOR UPDATE the assignment
        vendorScope + required-from guards
        UPDATE current_status_id = to
        INSERT status_history (from → to, changedBy = vendor-user|null)
        opts.sideEffect (ETA / check-in / check-out)
        applyDispatchJobFollow(tx, { dispatchToCode: to.code, actorUserId: vendor-user|null })  ← the auto-follow
        INSERT audit { actor: vendor, via: vendor_portal|magic_link }
```

## The auto-follow (`applyDispatchJobFollow`) — shared by both cores

```
applyDispatchJobFollow(tx, { tenantId, jobId, dispatchToCode, actorUserId }):
  m = DISPATCH_TO_JOB_ADVANCE[dispatchToCode]        // ON_SITE→IN_PROGRESS, WORK_COMPLETE→PENDING_INVOICE
  if !m → return (unmapped: nothing)
  n = count active dispatches for jobId              // category NOT IN ('cancelled','draft'), inside tx
  if n != 1 → return (multi-vendor or zero: hand-controlled)
  advanceJobStatus(tx, { toCode: m.toCode, fromCodes: m.fromCodes, actorUserId })   // forward-only, lock-free
```

Both legs run **in the same transaction** as the dispatch change → atomic (the dispatch and the job move
together, or neither does).

## Dispatch → job status line (single-vendor)

```
dispatch:  DRAFT → SENT → ACCEPTED → SCHEDULED → CONFIRMED → ON_SITE ──────→ WORK_COMPLETE
job:       (Send → DISPATCHED)                                  └→ IN_PROGRESS   └→ PENDING_INVOICE → (billing) → CLOSED_BILLED
```
