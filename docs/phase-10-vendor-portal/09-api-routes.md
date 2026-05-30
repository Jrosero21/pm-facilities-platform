# Phase 10 — Vendor Portal MVP · Routes & Server Actions

Phase 10 adds a new route group `(vendor)`, four URLs, one top-level page, four server-action files (8 callable actions), and nine server-only functions. The project has no REST API; **server actions are the callable mutation surface**. All vendor pages/actions gate via `requireVendor()`.

## Pages & layouts

| URL | File | Guard |
|---|---|---|
| — | `src/app/(vendor)/layout.tsx` | `requireVendor()` |
| `/vendor/jobs` | `(vendor)/vendor/jobs/page.tsx` (+ `loading.tsx`) | `requireVendor()` |
| `/vendor/jobs/[id]` | `(vendor)/vendor/jobs/[id]/page.tsx` (+ `loading.tsx`) | `requireVendor()` |
| `/vendor/jobs/[id]/invoices/new` | `(vendor)/vendor/jobs/[id]/invoices/new/page.tsx` | `requireVendor()` |
| `/vendor-no-access` | `src/app/vendor-no-access/page.tsx` | none (top-level, redirect target) |

`(vendor)` is URL-invisible; the literal `vendor/...` segment produces the `/vendor/...` URLs. `(app)/layout.tsx` is modified (the post-login role-routing shim).

## Server actions (4 files, 8 actions) — all `"use server"`, `requireVendor()`-gated, typed `{ error?: string }` return

| Action | File | Signature |
|---|---|---|
| `acceptDispatchAction` | `(vendor)/vendor/jobs/actions.ts` | `(assignmentId)` |
| `declineDispatchAction` | `…/jobs/actions.ts` | `(assignmentId, reason?)` |
| `confirmEtaAction` | `…/jobs/actions.ts` | `(assignmentId, etaStartAt, etaEndAt?, note?)` |
| `confirmScheduleAction` | `…/jobs/actions.ts` | `(assignmentId)` |
| `markOnSiteAction` | `…/jobs/actions.ts` | `(assignmentId, note?)` |
| `markWorkCompleteAction` | `…/jobs/actions.ts` | `(assignmentId, note?)` |
| `createVendorNoteAction` | `…/jobs/note-actions.ts` | `(assignmentId, _prev, formData)` |
| `createVendorPhotoPlaceholderAction` | `…/jobs/photo-actions.ts` | `(assignmentId, _prev, formData)` |
| `submitVendorInvoiceAction` | `…/jobs/[id]/invoices/new/actions.ts` | `(assignmentId, _prev, formData)` |

(The six transition actions take primitive args and are `.bind(null, id)` at the callsite; the form actions use the `useActionState` `(prev, formData)` shape.)

## Server-only functions (9 new, `src/server/vendor/`)

| Function | File | Returns |
|---|---|---|
| `getVendorScope` | `vendor-scope.ts` (in `src/server/`) | `Promise<Set<string>>` |
| `listVendorAssignments` | `list-assigned-jobs.ts` | assignment list rows |
| `getVendorAssignmentDetail` | `get-vendor-assignment-detail.ts` | assignment detail \| null |
| `listVendorAssignmentNotes` | `list-assignment-notes.ts` | note rows (DoR-10l.2 filter) |
| `listVendorAssignmentAttachments` | `list-assignment-attachments.ts` | attachment rows (author-scope) |
| `listVendorAssignmentInvoices` | `list-assignment-invoices.ts` | invoice rows (vendor_id IN scope) |
| `accept/decline/confirmEta/confirmSchedule/markOnSite/markWorkComplete` | `assignment-actions.ts` | `Promise<void>` (throws typed errors) |
| `createVendorNote` | `create-vendor-note.ts` | `Promise<JobNoteRow>` |
| `createVendorPhotoPlaceholder` | `create-vendor-photo-placeholder.ts` | `Promise<{ id }>` |
| `submitVendorInvoice` | `submit-vendor-invoice.ts` | `Promise<{ id }>` |

## Guard / predicate surface

- `requireVendor()` (`src/server/auth-context.ts`) → `VendorAuthContext`.
- `isVendorUser`, `canActOnAssignment`, `canSubmitVendorInvoice` (`src/server/role-predicates.ts`).

## Modified existing routes

- `(app)/layout.tsx` — post-login role-routing shim (redirects vendor users to `/vendor/jobs`).
- `(app)/jobs/[id]/page.tsx` — `NoteOriginBadge` beside `NoteVisibilityBadge` in the operator notes section (the only operator-side change in the phase).
