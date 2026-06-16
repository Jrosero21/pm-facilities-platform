# Per-Dispatch Status Tracking — API / Server Functions

## Server functions

| Function | File | Behavior | Throws |
|---|---|---|---|
| `advanceJobStatus(tx, {tenantId, jobId, toCode, fromCodes?, actorUserId, note?, extraSet?})` | `src/server/job-status.ts` | Resolve toCode→id; read current status under the caller's tx (no lock); forward-only `fromCodes` gate; UPDATE status + INSERT `job_status_history`. Returns `{advanced, fromStatusId}`. | `STATUS_NOT_FOUND`, `JOB_NOT_FOUND` |
| `applyDispatchJobFollow(tx, {tenantId, jobId, dispatchToCode, actorUserId})` | `src/server/job-status.ts` | Map lookup (`DISPATCH_TO_JOB_ADVANCE`); count active dispatches (category ∉ cancelled/draft) in-tx; if exactly 1, call `advanceJobStatus` forward-only. Lock-free. Returns `{advanced}`. | — |
| `setAssignmentStatus({tenantId, assignmentId, toCode, actorUserId, note?})` | `src/server/dispatch.ts` | Operator hand-advance: reject DRAFT/SENT; lock the assignment; same-status no-op; pure status set; history + `applyDispatchJobFollow` + audit (`actor:operator`). Returns `{changed, fromCode, toCode, jobId}`. | `STATUS_NOT_OPERATOR_SETTABLE`, `STATUS_NOT_FOUND`, `ASSIGNMENT_NOT_FOUND` |
| `performTransition(...)` (vendor, extended) | `src/server/vendor/assignment-actions.ts` | Unchanged vendor flow + `applyDispatchJobFollow` after its status update / side-effect (`actor:vendor`). | (existing) |

`DISPATCH_TO_JOB_ADVANCE` (the one swappable map) lives beside `advanceJobStatus`:
`ON_SITE → IN_PROGRESS` (from NEW/SCHEDULED/DISPATCHED), `WORK_COMPLETE → PENDING_INVOICE`
(from NEW/SCHEDULED/DISPATCHED/IN_PROGRESS).

## Server Action (`"use server"`)

| Action | File | Signature | Effect |
|---|---|---|---|
| `setAssignmentStatusAction` | `src/app/(app)/jobs/[id]/dispatch/[assignmentId]/actions.ts` | `(assignmentId, prev, formData)` → `SetStatusState` | `requireTenant` → `setAssignmentStatus` with `ctx.user.id`; maps the 3 errors; revalidates the assignment + job pages |

## UI

| Component | File | Role |
|---|---|---|
| `DispatchStatusPicker` | `src/components/dispatch-status-picker.tsx` | `"use client"` select + submit (mirrors `SendDispatchButton`); options = active statuses minus DRAFT/SENT/current, passed in from the server page |

Mounted on `…/dispatch/[assignmentId]/page.tsx` for non-DRAFT dispatches, beside the DRAFT-gated Send button.
The page fetches `listActiveDispatchStatuses()` and filters server-side.

## Refactor (behavior-preserving)

`advanceJobStatus` was extracted from three inline sites: `sendDispatch` (NEW/SCHEDULED→DISPATCHED) and
`markBillingClosed` (→CLOSED_BILLED, `closedAt` via `extraSet`) now call it; `createJob` stays inline (its
`null→NEW` fresh-insert history can't be reproduced by a read-current helper).
