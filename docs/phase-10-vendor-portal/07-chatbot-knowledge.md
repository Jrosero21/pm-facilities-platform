# Phase 10 — Chatbot Knowledge (Vendor Portal Primer)

The vendor-portal-domain primer for the future Phase-16 chatbot. **Fact-density over narrative.** Scope = Phase 10 only. Operator/vendor phrasings are canonical in `03-user-sop.md`; precise rules in `06-business-rules.md`; rationale in `02-decisions.md`; flows in `05-system-workflows.md`; boundaries in `10-known-limitations.md`.

## Mental model

- **Phase 10 = the first external portal.** Vendor users log in, see only their assigned (sent) jobs, and act on them. Write-heavy. Every write is scoped by `vendor_users` + `requireVendor`.
- Vendors are **rows under the aggregator tenant**, not their own tenants (`tenants.type='vendor'` is vestigial — `DoR-10b.1`).

## §1 — URL surfaces

- `/vendor/jobs` — assignment list (`requireVendor`).
- `/vendor/jobs/[id]` — assignment detail; `[id]` = **assignment id** (`DoR-10k.5`). Actions + Notes + Photos + Invoices sections.
- `/vendor/jobs/[id]/invoices/new` — invoice form (`DoR-10n.1` path deviation).
- `/vendor-no-access` — top-level, unguarded redirect target (mirrors `/forbidden`, `/no-tenant`).

## §2 — Server-only functions (`src/server/vendor/`)

- `getVendorScope(userId, tenantId)` (`vendor-scope.ts`) → `Set<vendorId>`.
- `listVendorAssignments(tenantId, scope)` → assignment rows (DRAFT excluded).
- `getVendorAssignmentDetail(tenantId, assignmentId, scope)` → one assignment or null (scope-guarded).
- `listVendorAssignmentNotes / …Attachments / …Invoices(tenantId, assignmentId, scope)` → scoped read-backs.
- `assignment-actions.ts` → `acceptDispatch / declineDispatch / confirmEta / confirmSchedule / markOnSite / markWorkComplete` (over shared `performTransition`).
- `create-vendor-note.ts` → `createVendorNote`; `create-vendor-photo-placeholder.ts` → `createVendorPhotoPlaceholder`; `submit-vendor-invoice.ts` → `submitVendorInvoice` (wraps Phase 8 `recordVendorInvoice`).

## §3 — Predicates & guard (`src/server/role-predicates.ts`, `auth-context.ts`)

- `isVendorUser(ctx)` = `hasAnyRole(ctx, ['vendor_user'])`.
- `canActOnAssignment(scope, {tenantId,vendorId}, tenantId)` / `canSubmitVendorInvoice(...)` — pure, take resolved scope.
- `requireVendor()` → `VendorAuthContext` (TenantAuthContext + `vendorScope`); redirects to `/vendor-no-access` on non-vendor / empty-scope.

## §4 — Database tables

- **New:** `vendor_users (id, tenant_id, user_id, vendor_id, created_at, updated_at)` — many-to-many, unique `(tenant_id,user_id,vendor_id)`, all FKs cascade (migration `0025`).
- **Augmented:** `job_notes.origin varchar(16) NOT NULL DEFAULT 'operator'` (migration `0026`) — values `operator` | `vendor`.
- **Written by vendor flows (existing tables):** `job_vendor_assignments` (status), `job_vendor_assignment_status_history`, `vendor_eta_confirmations`, `vendor_check_ins`, `vendor_check_outs`, `job_notes`, `job_attachments` (NULL file_url placeholders), `vendor_invoices` + `vendor_invoice_line_items`, `audit_logs`.

## §5 — Audit-log actions added

All on `audit_logs` with `targetType='job_vendor_assignment'|'job_note'|'job_attachment'`, `targetId`, `metadata`:
- `job_vendor_assignment.accepted | .declined | .eta_confirmed | .schedule_confirmed | .on_site | .work_complete` — in-txn, `metadata: { jobId, vendorId, actor:'vendor', via:'vendor_portal'[, etaStartAt] }`.
- `job_note.created` (via `createJobNote`) — out-of-txn.
- `job_attachment.placeholder_created` — out-of-txn, `metadata.placeholder=true`.
- Invoices emit `vendor_invoice.received` to **`job_billing_events`** (Phase 8), not `audit_logs`.

## §6 — Harness

`scripts/check-vendor-predicates.ts` — `npm run db:check:vendor-predicates`. 61 assertions. **Seed-dependent + destructive** (re-seed before re-run). Fixture markers: `[10l-fixture]` notes, `[10m-fixture]` photos, `[10n-fixture]` invoice.

## §7 — Phase 8 / earlier substrate reused

- `recordVendorInvoice` (`src/server/billing/vendor-invoices.ts`) — totals, NTE governance, `vendor_invoice.received` event; vendor side only wraps it.
- `dispatch_assignment_statuses` (global) + `getDispatchAssignmentStatusByCode` — status code→id resolution.
- `getAssignmentDetail` (`src/server/dispatch.ts`) — tenant-scoped assignment read; the vendor wrapper adds the scope guard.
- `NoteVisibilityBadge` / `DispatchStatusBadge` — reused UI primitives.
