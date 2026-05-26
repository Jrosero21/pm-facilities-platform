# Phase 5 — API Routes & Server Actions

## Pages (under the authenticated `(app)` route group)
- **`/jobs/[id]`** — the Phase 4 job detail page gains a **Dispatch section** (server-rendered card list via `listAssignmentsForJob`; category-colored status badges; compact facet line; CTA "Dispatch a vendor" gated to a "assign a trade first" hint when the job has no trade).
- **`/jobs/[id]/dispatch/new`** — new-dispatch form (server component): `getJobDetail` + `findCandidateVendorsForJob` + per-candidate `listVendorLocations`/`listVendorContacts` enrichment → `NewDispatchForm`. Renders the empty-candidates guidance when the matcher returns none; the no-trade message when the job has no trade.
- **`/jobs/[id]/dispatch/[assignmentId]`** — assignment workspace (server component): `getAssignmentDetail`; `notFound()` if missing, cross-tenant, **or** the assignment's `jobId` ≠ the route `[id]`. Renders key facts + the verbose "Match at dispatch" snapshot + dispatch scope + the **Send dispatch** button (only while `status === DRAFT`). ETA/check-in/messages sections are intentionally **omitted** (Phase 6).

No new top-level nav — dispatch lives under the jobs route tree (breadcrumbs `Jobs / #N / Dispatch`).

## Server actions (colocated with their forms)
- **`createDispatchAction(jobId, prev, formData)`** — `jobs/[id]/dispatch/new/actions.ts`. `jobId` bound; requires `vendorId`; parses optional branch/contact/NTE/schedule/scope. Calls `createDispatch`; maps `JOB_NOT_FOUND` / `JOB_NOT_DISPATCHABLE` / `VENDOR_NOT_FOUND` / `VENDOR_LOCATION_*` / `VENDOR_CONTACT_*` / `VENDOR_NO_LONGER_CANDIDATE` / `STATUS_NOT_FOUND` to friendly messages; `revalidatePath("/jobs/[id]")`; redirects to `/jobs/[id]/dispatch/[newId]`.
- **`sendDispatchAction(assignmentId)`** — `jobs/[id]/dispatch/[assignmentId]/actions.ts`. `assignmentId` bound; takes no form fields (Send is a button). Calls `sendDispatch`; maps `ASSIGNMENT_NOT_DRAFT` / `JOB_BECAME_TERMINAL` / `JOB_NOT_DISPATCHABLE` / `ASSIGNMENT_NOT_FOUND` / `STATUS_NOT_FOUND` to friendly messages; on success `revalidatePath`s the workspace + the parent job (jobId from the result); **no redirect** (the page re-renders as SENT). A no-extra-param server action, `useActionState`-compatible after `.bind`.

## Data layer (server-only modules)
- **`src/server/vendor-matching.ts`** (5a) — `findCandidateVendorsForJob(tenantId, jobId)` and `findCandidateVendorsForJobByFacets(...)` → `VendorCandidate[]` (vendorId/Name/Type, primaryTradeMatch, tradeScope, geoMatchTypes, tightestGeoMatch, complianceStatus). Read-only; the cross-vendor matching query (WF-5.1).
- **`src/server/dispatch.ts`** (5c) — `getAssignment` (lean, tenant-scoped, for guards/reload), `listAssignmentsForJob` (joined labels + category + facet fields for the dispatch section), `getAssignmentDetail` (joined labels + category + full snapshot for the workspace), **`createDispatch`** (3-write txn; **audit via `tx.insert(auditLogs)` INSIDE the txn**; no `job_events`), **`sendDispatch`** (dual-entity txn, parent-before-child `FOR UPDATE` locks; **audit inside the txn**; writes `job_events` `job.dispatched`).
- **`src/server/dispatch-reference.ts`** (5c) — `getDispatchAssignmentStatusByCode` (global, mirrors `getJobStatusByCode`), `listActiveDispatchStatuses`.
- **`src/server/vendor-contacts.ts`** — added `getVendorContact(tenantId, id)` (tenant-scoped guard).
- **`src/server/vendor-trade-coverage.ts`** — added `branchCoversTrade(tenantId, vendorLocationId, tradeId)` (branch-level active-coverage check for `chosen_branch_covered_trade`).
- **`src/server/jobs.ts`** — `getJobDetail` gained `approvedScopeOfWork` (for the scope pre-fill).

All dispatch modules are tenant-scoped; reads return null/empty on cross-tenant; creates throw tenant-scoped `*_NOT_FOUND` (R-4.6). `vendor-matching.ts`, `dispatch.ts` import `server-only`.

## Components
- `NewDispatchForm` (client; `useActionState` + `useState(selectedVendorId)`; matcher-candidate radio-card picker — single candidate as an info panel, multiple pre-selecting the top-ranked; branch/contact `<select key={selectedVendorId}>` remount — R-4.12; pre-fill discipline — R-5.11; conditional scope label — D-5.23).
- `SendDispatchButton` (client; `useActionState` over the bound `sendDispatchAction`; pending + inline error).
- `DispatchStatusBadge` (server; category → semantic color — R-5.13).
- `dispatch-facets.ts` (pure label helpers — `tradeMatchLabel`/`geoMatchLabel`/`complianceLabel`/`facetLine`; the "Primary trade: X" copy precision lives here — R-5.10).

## Conventions reinforced / added
- `requireTenant()` at the top of every action; parent-in-tenant guard before every create (`getVendor`/`getVendorLocation`/`getVendorContact`/`getJob`).
- **Audit-rule split (R-4.5) reused:** `createDispatch` + `sendDispatch` audit **inside** the transaction (multi-row atomic).
- **Parent-before-child lock order (R-5.7)** — the new canonical multi-entity pattern.
- **`job_events` is the milestone timeline, not an action log (R-5.5)** — `createDispatch` writes no event; `sendDispatch` writes `job.dispatched`.
- Create returns a freshly-read row (R-4.7). Domain-verb events (R-5.6). Pre-fill discipline (R-5.11).

## Forward pointers
- **Phase 6** adds the ETA / check-in/out / messages UI + actions on these tables, the `dispatch_messages` delivery layer, and the note-visibility/communication workflows. The review-and-publish flows reuse the **parent-before-child lock order** (R-5.7).
- **Phase 10** vendor portal adds vendor-side accept/decline actions (assignment status transitions beyond Send).
