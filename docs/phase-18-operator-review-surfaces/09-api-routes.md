# Phase 18 — API Routes / Server Actions

## Routes

| Route | Type | Auth | Purpose |
|---|---|---|---|
| `/review` (default / `?tab=drafts`) | Server Component page | `requireTenant` (+ `(app)` layout operator gate) | Tenant-wide AI-draft review queue |
| `/review?tab=vendor-updates` | Server Component page (same route) | `requireTenant` | Tenant-wide vendor-updates inbox |

`/review` is a single tabbed Server Component (`src/app/(app)/review/page.tsx`); the tab is
`searchParams`-driven (no client tab state). A nav `<Link href="/review">` was added to
`src/app/(app)/layout.tsx`.

## Server readers (no HTTP route — called by the Server Component)

| Function | File | Returns |
|---|---|---|
| `listPendingReviewDraftsDetailed(tenantId)` | `src/server/agents/drafts.ts` | `DraftQueueItem[]` — `pending_review`+`approved` drafts across jobs, with confidence/rationale + `jobNumber`/`clientName` |
| `listVendorUpdates(tenantId)` | `src/server/job-notes.ts` | `VendorUpdateItem[]` — vendor-origin, non-archived notes with author + `jobNumber`/`clientName` |
| `getJobNote(tenantId, id)` | `src/server/job-notes.ts` (pre-existing) | `JobNoteRow \| null` — tenant-scoped single note (the promotion guard) |

## Server writer

| Function | File | Behavior | Throws |
|---|---|---|---|
| `promoteNoteVisibility({tenantId, noteId, toVisibility, actorUserId})` | `src/server/job-notes.ts` | guard → target check → single-row `UPDATE job_notes.visibility` → `writeAuditLog('job_note.visibility_promoted')`. **No outbound.** | `NOTE_NOT_FOUND`, `INVALID_PROMOTION_TARGET` |

## Server Action (`"use server"`)

| Action | File | Signature | Effect |
|---|---|---|---|
| `promoteNoteVisibilityAction` | `src/app/(app)/jobs/note-visibility-actions.ts` | `(jobId, noteId, _prev, formData)` → `RewriterActionState` | `requireTenant` → `promoteNoteVisibility(...)`; maps `NOTE_NOT_FOUND`/`INVALID_PROMOTION_TARGET` to a form error; `revalidatePath('/review')` + `revalidatePath('/jobs/{jobId}')` |

The draft-queue forms reuse the **existing** wrappers in `src/app/(app)/jobs/rewriter-actions.ts`
(`approveDraftAction`, `rejectDraftAction`, `discardDraftAction`, `publishDraftAction`) — Phase 18 added
no new draft actions.

## Harness alias (package.json)

| Script | Command |
|---|---|
| `db:check:operator-review` | `tsx --env-file=.env.local --conditions=react-server scripts/check-operator-review.ts` |
