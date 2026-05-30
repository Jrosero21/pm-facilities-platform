# Phase 10 — Vendor Portal MVP · System Workflows

How Phase 10's pieces compose into operational flows. Each flow **cites** the rules (`06-business-rules.md`), decisions (`02-decisions.md`), and routes (`09-api-routes.md`) it is built from — it does not re-derive them.

## Workflow 1 — Login → role-routed landing

`POST /login` (better-auth) → cookie set → client `router.push("/dashboard")`. The **`(app)/layout.tsx` shim** then runs `requireAuth()` and, if `ctx.activeTenant && isVendorUser(ctx) && !canSeeOperations(ctx)`, resolves `getVendorScope`: non-empty → `redirect("/vendor/jobs")`; empty → `redirect("/vendor-no-access")`. Dual-role users keep the aggregator default (`02-decisions §A Fork 2`).

## Workflow 2 — `requireVendor()` guard composition

`(vendor)/layout.tsx` (and every vendor page) calls `requireVendor()`: `requireTenant()` → assert `isVendorUser(ctx)` (else `redirect("/vendor-no-access")`) → `getVendorScope(user.id, activeTenant.tenantId)`; empty → `redirect("/vendor-no-access")`. Returns `VendorAuthContext = TenantAuthContext & { vendorScope: Set<string> }` so nested pages reuse the scope without re-fetching. Bare-redirect convention, no flash (`06 §11`).

## Workflow 3 — `getVendorScope()` resolution

`src/server/vendor-scope.ts` (impure, `server-only`): `SELECT vendor_id FROM vendor_users WHERE tenant_id=? AND user_id=?` → `Set<vendorId>`. Empty set for non-mapped users; never throws. This is the single vendor-scope primitive every reader/guard composes on.

## Workflow 4 — Assignment transition (e.g. `acceptDispatch`)

`src/server/vendor/assignment-actions.ts`, shared `performTransition(input, fromCode, toCode, auditAction, opts)`:
1. Resolve from/to statuses by code (`getDispatchAssignmentStatusByCode`).
2. **One transaction:** lock the assignment row `FOR UPDATE` (only the assignment — vendor transitions never touch the job, `DoR-10k.4`); re-check `vendorScope.has(vendorId)` (scope **before** status); re-check `currentStatusId === from.id` (`ASSIGNMENT_NOT_IN_REQUIRED_STATUS`).
3. `UPDATE jobVendorAssignments SET currentStatusId = to.id [, extraSet]`.
4. `INSERT job_vendor_assignment_status_history` (from→to, `changedByUserId`).
5. Optional side-effect (ETA / check-in / check-out).
6. `INSERT audit_logs` **in-transaction** with `metadata: { jobId, vendorId, actor:'vendor', via:'vendor_portal' }` (`DoR-10k.1`; audit-write txn discipline, `02 §D`).

The action wrapper (`jobs/actions.ts`) adds `requireVendor()` + domain-error→`{error}` mapping + `revalidatePath`.

## Workflow 5 — `confirmEta` is the scheduling act (`DoR-10k.3`)

`confirmEta` runs Workflow 4 with `fromCode=ACCEPTED, toCode=SCHEDULED`, `extraSet={ scheduledStartAt: etaStartAt }`, and a side-effect inserting `vendor_eta_confirmations`. So one transaction records the ETA, sets the schedule, and advances the status — submitting an ETA *is* scheduling.

## Workflow 6 — Vendor note creation

`createVendorNote` (`src/server/vendor/create-vendor-note.ts`): resolve assignment → `(jobId, vendorId)` via `getAssignmentDetail`; `canActOnAssignment` guard; delegate to `createJobNote({ origin:'vendor', visibility:'internal_only' })`. `createJobNote` writes the note + an **out-of-transaction** `writeAuditLog` (`job_note.created`). Single-insert → out-of-txn audit (`02 §D`).

## Workflow 7 — Vendor note read filter (`DoR-10l.2`)

`listVendorAssignmentNotes`: resolve assignment + scope guard, then `SELECT … WHERE tenant + job + status!=archived AND ( visibility IN ('vendor_visible','client_and_vendor_visible') OR ( origin='vendor' AND created_by_user_id IN (SELECT user_id FROM vendor_users WHERE tenant_id=? AND vendor_id IN scope) ) )`. The author-scope subquery prevents cross-vendor leakage on shared jobs.

## Workflow 8 — Photo placeholder creation

`createVendorPhotoPlaceholder`: resolve assignment + `canActOnAssignment`; `INSERT job_attachments` with `attachment_type='photo'`, `visibility='internal_only'`, `uploaded_by_user_id=actor`, **file columns NULL** (the placeholder marker); out-of-transaction `writeAuditLog` (`job_attachment.placeholder_created`, `metadata.placeholder=true`). Read filter (`listVendorAssignmentAttachments`) is author-scope only — no `origin` column (`DoR-10m.1`).

## Workflow 9 — Invoice submission via Phase 8 `recordVendorInvoice`

`submitVendorInvoice` (`src/server/vendor/submit-vendor-invoice.ts`): `>=1` line item (`DoR-10n.3`); resolve assignment → `(jobId, vendorId)`; `canSubmitVendorInvoice` guard (`DoR-10n.2`, loose); delegate to **Phase 8** `recordVendorInvoice({ sourceType:'vendor_portal', assignmentId, lineItems, … })`. Phase 8 does the rest in one tx: header insert → line inserts → `recalculateVendorInvoiceTotals` (subtotal/tax/total/exceeds_nte) → emit `vendor_invoice.received`. Status lands `received` (DB default). No Phase 8 modification.

## Workflow 10 — Operator review of vendor updates

No new operator surface. **Status:** the assignment status-history timeline. **Notes/photos:** operators see them in the existing job-detail notes section, vendor notes tagged "Vendor" (`NoteOriginBadge`); promotion to client-visible is deferred (`DoR-10l.1`). **Invoices:** `vendor_portal`-source invoices flow the existing operator AP ladder (`received → under_review → approved/disputed → paid`) — identical to manual-source invoices.

## Workflow 11 — Route deviation (`DoR-10n.1`)

The invoice form lives at `/vendor/jobs/[id]/invoices/new` (assignment-scoped), not roadmap §8's literal `/vendor/invoices/new`. The assignment id in the path resolves `jobId`/`vendorId` that `recordVendorInvoice` requires; a top-level route would need an assignment picker. Documented permanent (`10-known-limitations.md §9`).
