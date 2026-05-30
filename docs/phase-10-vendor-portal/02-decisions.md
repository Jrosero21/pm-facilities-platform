# Phase 10 — Vendor Portal MVP · Decisions

The locked calls and their rationale, accumulated across the gates (10a inspection/design → 10b fork-lock → 10c–10n construction). Format: the decision, then **Why**. Terminology established here (author-scope-vs-origin discriminator, populated-table additive-default cadence, audit-write txn discipline) is authoritative and flows downstream.

---

## A. The 10 locked forks (10b · `cbfe002`)

### Fork 1 — Vendor-user linkage: new `vendor_users` join table
`(id, tenant_id, user_id, vendor_id, created_at, updated_at)`, many-to-many, all FKs cascade, unique `(tenant_id, user_id, vendor_id)`. A vendor user also holds a `tenant_users` membership + a `vendor_user` role grant in the aggregator tenant; `vendor_users` adds the vendor-scope on top. **Why:** rejects `users.vendor_id` (forces single-vendor users, pollutes the auth table); rejects `tenant_users` overload (mixes role-membership with vendor-scope); rejects vendor-as-tenant (`DoR-10b.1`). The join table mirrors the platform's `user_roles`/`tenant_users` idiom and gives `getVendorScope` exactly the vendor-id set it needs.

### Fork 2 — Login surface: shared `/login`, role-routed redirect
One auth backend. Post-`requireAuth` shim in `(app)/layout.tsx`: a `vendor_user` without an operator-class role and with non-empty scope → `/vendor/jobs`; empty scope → `/vendor-no-access`. **Why:** better-auth issues one session cookie; a separate `/vendor/login` authenticates the same backend and still has to role-route. Branded login banked (`FB-10a.2`).

### Fork 3 — Visibility scope: per vendor-organization
Within the active aggregator tenant. `getVendorScope(userId, tenantId)` → `Set<vendorId>`; readers filter `vendor_id IN scope`. **Why:** the natural unit is the vendor org — multiple staff of one vendor see that vendor's assignments. Per-assignment is too granular (assignments carry a `vendor_contact_id`, not a vendor-*user* FK).

### Fork 4 — Note origin: `origin` column on `job_notes`
`varchar(16) NOT NULL DEFAULT 'operator'` (migration `0026`). Vendor notes write `origin='vendor'`, `visibility='internal_only'`. **Why:** reuses the single `job_notes` timeline (one reader, one render); captures provenance as an immutable write-time fact (not inferred from the author's current role, which can change). Separate `vendor_notes` table would fragment the timeline.

### Fork 5 — Vendor status flow: forward-only, no CANCELLED
Vendor controls SENT→ACCEPTED/DECLINED, ACCEPTED→SCHEDULED (via ETA), SCHEDULED→CONFIRMED, CONFIRMED→ON_SITE, ON_SITE→WORK_COMPLETE. Each dual-writes history. **Why:** these are the vendor-controllable lifecycle steps; cancellation is operator-only.

### Fork 6 — Operator review: hybrid via existing substrate, no new queue table
Status auto-applies (review = the history timeline); notes/photos auto-apply but default `internal_only` (the gate is visibility, not existence); invoices land `received` and flow the existing AP ladder. **Why:** roadmap §2.3 "capture-first, review-later" — the gate is whether vendor data becomes *client-facing*, which the existing `visibility` axis governs. (Revised by `DoR-10l.1` — see §C.)

### Fork 7 — Photo upload: placeholder, metadata-row variant
Metadata-only `job_attachments` row, NULL file columns; no upload backend. **Why:** no upload infra exists; real upload is a phase of its own. NULL `file_url` is the cross-phase placeholder marker (`FB-10a.4`).

### Fork 8 — Invoice submission: basic form → `vendor_invoices`
Writes via Phase 8's `recordVendorInvoice` with `source_type='vendor_portal'`, lands at `received`. **Why:** the Phase 8 writer already computes totals + NTE governance + the billing event; the substrate was pre-wired (`vendor_portal` already in the `source_type` enum). No `draft` state — `received` is the intake state.

### Fork 9 — Route structure: new `(vendor)` route group
Own `layout.tsx` calling `requireVendor()`; routes under `(vendor)/vendor/...`. **Why:** the `(app)` layout assumes aggregator chrome + `requireAuth`; a separate group gets a vendor shell + guard + clean separation, and sets the Phase 11 `(client)` template.

### Fork 10 — Vendor predicates: compose over `role-predicates.ts`
`isVendorUser` (pure), `getVendorScope` (impure resolver), `canActOnAssignment` / `canSubmitVendorInvoice` (pure, take resolved scope), `requireVendor` (guard). **Why:** mirrors the `isAccountingRole`/`enforceAccountingGate` split — pure predicates stay testable, the impure resolver is isolated.

---

## B. Decisions-of-Record (binding; numerical order)

- **DoR-10b.1** (`cbfe002`) — **`tenants.type='vendor'` is vestigial.** The enum value exists but Phase 10 does NOT promote vendor orgs to tenants; vendors stay aggregator-tenant-scoped rows. **Why:** all jobs/assignments a vendor must see live in the aggregator tenant; a vendor-tenant would force cross-tenant reads the tenant-scoped reader pattern forbids. Enum cleanup is `FB-10b.1`.
- **DoR-10b.2** (`cbfe002`) — **`job_notes.origin` migration is safe-additive.** `ADD COLUMN ... NOT NULL DEFAULT 'operator'`; MariaDB applies the default to existing rows at column-add. All pre-Phase-10 notes are operator-authored, so the default is semantically correct — no backfill script. **Verified empirically at 10l-migration** (3 prod rows → `operator`, 0 NULLs).
- **DoR-10b.3** (`cbfe002`, **revised by DoR-10k.1**) — **every vendor status transition dual-writes the history table.** Overwrite-only writes prohibited; history + (audit) on every transition. (The original phrasing named a `source='vendor_portal'` history column; that column does not exist — see §C.1.)
- **DoR-10j.1** (`1f3986a`) — **DRAFT assignments are excluded from the vendor list.** Drafts are operator workspace, not yet sent; the vendor sees an assignment only after it has been sent. Filter is by status **code** (`ne(code,'DRAFT')`), not `sent_at`.
- **DoR-10k.1** (`dd0c54b`) — **vendor provenance lives in `audit_logs.metadata`, not a history column.** `job_vendor_assignment_status_history` has no `source`/`actor_type` column (confirmed empirically at 10k-inspect). Vendor writes record `metadata: { actor:'vendor', via:'vendor_portal' }` on the audit row. **Revises DoR-10b.3:** the dual-write contract holds; only the provenance discriminator moved to audit metadata.
- **DoR-10k.2** (`dd0c54b`) — **explicit allowed-from-status guards per action; no transition map.** No `TRANSITIONS` map exists for dispatch (transitions are implicit inline guards). Each vendor action throws `ASSIGNMENT_NOT_IN_REQUIRED_STATUS` if `currentStatusId !== expectedFrom`. See the matrix in `06-business-rules.md §4`.
- **DoR-10k.3** (`dd0c54b`) — **`confirmEta` IS the scheduling act.** One transaction inserts `vendor_eta_confirmations`, sets `jobVendorAssignments.scheduledStartAt`, and transitions ACCEPTED→SCHEDULED. Resolves the 10b Fork-5 open question (who moves ACCEPTED→SCHEDULED): the vendor, by submitting an ETA.
- **DoR-10k.4** (`dd0c54b`) — **vendor transitions never advance the parent job status.** Operator review (the timeline) is the onward-action point. So the transition tx locks only the assignment row (unlike `sendDispatch`, which also locks the parent job).
- **DoR-10k.5** (`3891b55`) — **`[id]` is the assignment id, not the job id.** The vendor mental model and the canonical scoped read (`getAssignmentDetail`) are assignment-keyed; a job may carry multiple assignments but a vendor sees only their own.
- **DoR-10l.1** (`125ab50`) — **operator visibility-promotion deferred.** The codebase has no post-creation visibility-update action; 10b Fork-6's "operator promotes" prose was empirically untrue. Phase-10 operator review = visibility of origin-tagged vendor notes in the existing operator section + the existing `ShareNoteButton` outbound flow. Promotion banked (`FB-10l.2`).
- **DoR-10l.2** (`125ab50`) — **the vendor note read filter scopes vendor-origin reads by the author's `vendor_users` membership.** A vendor sees a note iff `visibility ∈ {vendor_visible, client_and_vendor_visible}` OR (`origin='vendor'` AND `created_by_user_id ∈` the viewer's `vendor_users`-scope subquery). Prevents vendor A from seeing vendor B's vendor-origin notes on a shared job.
- **DoR-10m.1** (`2c7b881`) — **author-scope is the default discriminator; an `origin` column is added only when the read filter must distinguish writes from multiple actor-classes on the same user-set.** Notes have `origin` (operators AND vendors both write notes). Attachments are MVP-vendor-only-writer → `uploaded_by_user_id ∈` vendor-scope suffices, no `origin`. The notes/attachments asymmetry is deliberate.
- **DoR-10m.2** (`2c7b881`) — **photo placeholders default `visibility='internal_only'`** (operator promotion deferred, `FB-10l.2`).
- **DoR-10m.3** (`2c7b881`) — **the photo form requires a title** (single text input; no caption/description in MVP).
- **DoR-10n.1** (`fc63bca`) — **the invoice route is assignment-scoped: `/vendor/jobs/[id]/invoices/new`**, a documented deviation from roadmap §8's literal `/vendor/invoices/new`. **Why:** `recordVendorInvoice` needs `jobId` + `vendorId` (+ `assignmentId`), which resolve naturally from the assignment; a top-level route would require an assignment picker.
- **DoR-10n.2** (`fc63bca`) — **`canSubmitVendorInvoice` stays loose** (tenant + scope check; no status gate). Operators dispute/reject via the existing AP ladder. Tightening to require WORK_COMPLETE is `FB-10g.1`.
- **DoR-10n.3** (`fc63bca`) — **an invoice requires ≥1 line item**, validated client-side (remove disabled at one row) and server-side (`INVOICE_REQUIRES_LINE_ITEMS`).

---

## C. Empirical corrections (prose-vs-reality findings that revised a locked call)

The phase's recurring lesson — **empirical truth over prose** — produced three corrections:

1. **DoR-10b.3 → revised by DoR-10k.1.** 10b posited a `history.source='vendor_portal'` column. 10k-inspect found the history table has no such column. The dual-write contract is unchanged; provenance moved to `audit_logs.metadata`. *Lesson: inspect the target table before locking a column-shaped decision.*
2. **10b Fork-6 hybrid review → revised by DoR-10l.1.** 10b posited operators "promote" a vendor note's visibility. 10l-construct-inspect found no visibility-update action anywhere. Operator review is read-only-with-origin-tag + the existing share flow; promotion is banked. *Lesson: a workflow the design assumes may not exist in code.*
3. **Roadmap §8 invoice path → DoR-10n.1.** The roadmap's literal `/vendor/invoices/new` lacks the assignment context the Phase-8 writer needs; the assignment-scoped route is the data-flow-correct choice. *Documented as design-of-record, not silently diverged.*

---

## D. Project-level patterns established in Phase 10

- **Author-scope-vs-origin discriminator (DoR-10m.1).** The reusable rule for "how does a read filter identify vendor-authored rows": default to author-scope (`uploaded_by`/`created_by ∈` vendor-scope subquery); add an `origin` column only when multiple actor-classes write the same user-set's rows.
- **Populated-table additive-default migration cadence (DoR-10b.2 / 10l-migration).** `ADD COLUMN ... NOT NULL DEFAULT x` on a table with prod rows: the default backfills safely; verify empirically (row count, 0 NULLs) post-prod-apply. The third execution of the drizzle→generate→SQL-inspect→sandbox-apply→contract-verify→prod-apply→verify→commit cadence (after `0025`, `0024`) — now a project invariant.
- **Audit-write txn discipline.** Multi-write actions (status update + history + audit, e.g. the six transitions) write the audit row **in-transaction** (atomic, `sendDispatch` template). Single-insert actions (note, photo) write audit **out-of-transaction** via `writeAuditLog` (`createJobNote` template).
- **Phase-9 seed fixture is id-free declarative data.** `SEED_TENANT`/`VENDORS`/`SEED_USERS` carry no DB ids; ids are uuidv7/better-auth assigned at insert. Oracles must resolve tenant/vendor/user ids from the DB at runtime (by slug/name/email), never read them off the fixture.
- **Route-group URL-invisibility.** `(vendor)` is URL-invisible; `(vendor)/vendor/<route>/page.tsx` serves `/vendor/<route>`. A literal segment inside the group produces the URL prefix. (Caught at 10i as a build-time route collision.)
- **`drizzle inArray(col, subquery)` is supported and typechecks** — used by the notes/attachments author-scope filters.
- **`audit_logs` shape:** `targetType` + `targetId` + `metadata` (JSON) — established at 10k-actions, followed by the photo audit.
- **Insert-id idiom: match the local template.** `sendDispatch`-pattern writers omit `id` (drizzle `$defaultFn`); `createJobNote`/`recordVendorInvoice`-pattern writers pass explicit `uuidv7()`.
- **Seed/harness calling `src/server/billing/*` must dynamic-import after the env-swap.** `recordVendorInvoice` statically imports `db`; a top-level import binds it to prod before the sandbox swap. (Caught at 10n.) See `04-admin-sop.md §6`.
