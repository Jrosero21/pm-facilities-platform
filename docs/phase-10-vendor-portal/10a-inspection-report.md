# 10a Inspection Report — Phase 10 Vendor Portal substrate

Inspection-only sweep of the live repo and live DB to establish empirical ground truth before any Phase 10 design is locked. No schema, routes, migrations, or commits were produced. Every claim below is sourced to a file path + line range or a live query result. Recommendations are deliberately absent — they live in `10a-design-proposal.md`.

---

## §1 Branch & worktree state

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| Branch | `phase-10-vendor-portal` | `phase-10-vendor-portal` | ✅ |
| HEAD | `d6f6a58` (handoff) | `d6f6a5816755b8681a93dcd91531a74027fe2e5e` | ✅ |
| Working tree | clean | clean (empty `git status --short`) | ✅ |
| Tunnel | up | `nc -z 127.0.0.1 3307` → succeeded | ✅ |

`git log --oneline -5` top: `d6f6a58 Phase 10 (10.0): opening handoff document for next chat`, sitting on `17cb14a` (Phase 9 9g closeout). No stop-trigger fired.

---

## §2 Schema inventory (drizzle)

**Drift note (carried into §10):** the paste-back assumed `src/db/schema/`. The live schema directory is **`src/server/schema/`** (34 `.ts` files, aggregated by `src/server/schema/index.ts`). There is no `src/db/` tree. All paths below are under `src/server/schema/`.

### §2a Tenancy / users / roles
- **`auth.ts`** — `users` (id, name, email[unique], emailVerified, image), `sessions`, `accounts` (holds `password`), `verifications`. These are the **better-auth managed tables living inside our own drizzle namespace** (see §4). `users` carries **no `vendor_id`** and **no `tenant_id`** (lines 4–14).
- **`tenants.ts`** — `tenants` (id, name, slug, `type` enum `["aggregator","vendor","client"]` default `aggregator`, `status`) at lines 12–26; `tenant_users` (tenantId, userId, status `["active","invited","suspended"]`, unique on (tenant_id,user_id)) at lines 28–51. `tenant_users` carries **no `vendor_id` discriminator** — it is purely user↔tenant membership.
- **`roles.ts`** — `roles` (id, `key`[unique,64], label, `scope` enum `["global","tenant"]`, description) at lines 14–24; `user_roles` (userId, roleId, **nullable** tenantId, grantedAt, grantedByUserId) at lines 26–56. Role grants are per-(user,role,tenant); a null tenantId = a global grant.

### §2b Vendor records
- **`vendors.ts`** — `vendors` (lines 21–64): **`tenant_id` NOT NULL** → vendor records are tenant-scoped to the aggregator that owns them; `vendor_type` `["local","regional","national"]`, `vendor_code`, status. `vendor_contacts` (lines 67–97), `vendor_locations` (lines 103–143, with lat/lng).
- **`vendor-details.ts`** — schema-only forward tables: `vendor_rates` (Phase 8 billing), `vendor_documents` (lines 81–121, **`file_url`/`file_size_bytes`/`file_mime_type` all nullable** — upload infra deferred), `vendor_compliance`, `vendor_performance_scores`.
- `vendor_service_areas` / `vendor_trade_coverage` exist as tables (live DB, §3) with data-layer files at `src/server/vendor-service-areas.ts` / `vendor-trade-coverage.ts`.

### §2c Assignment + assignment-update substrate
- **`dispatch-assignments.ts`** — `job_vendor_assignments` (lines 62–152): one row per (job,vendor) dispatch; **no `assignment_status` enum column** — status is an FK `current_status_id` → `dispatch_assignment_statuses` (a global reference table). Carries the dispatch-time matcher snapshot (immutable), `agreed_nte_amount`, `scheduled_start/end_at`, `sent_at`. FK `jva_vendor_fk` → vendors (RESTRICT). `job_vendor_assignment_status_history` (lines 159–201): append-only typed transition log (from→to status FK), `changed_by_user_id`, `note`.
- **`dispatch-reference.ts`** — `dispatch_assignment_statuses` (lines 33–67): **GLOBAL** (no tenant_id), unique `code`, `category` enum `["draft","pending","active","completed","cancelled"]`, `sort_order`, `is_terminal`.
- **`dispatch-comms.ts`** — `dispatch_messages` (lines 48–89): `direction` enum `["outbound","inbound"]` (inbound already anticipated), `message_type` varchar (open vocab), `visibility` enum (5 values, identical to job_notes), `sent_by_user_id`. Keyed by `assignment_id`.
- **`dispatch-presence.ts`** — `vendor_eta_confirmations` (lines 18–51), `vendor_check_ins` (lines 59–91), `vendor_check_outs` (lines 93–125). **All three are keyed by `assignment_id` (not job_id)**; ETA carries `confirmed_by_user_id`, check-in/out carry `recorded_by_user_id`. The file comment (lines 53–58) frames them as **"operator-recorded presence events"** — i.e. Phase 5 built them operator-entered.

### §2d Job substrate touched by vendors
- **`job-details.ts`** — `job_notes` (lines 64–89): `body`, `visibility` enum, `status` soft-delete, `created_by_user_id`. **No `origin` column. No `created_by_role` column.** `job_attachments` (lines 94–132): `attachment_type` enum incl. `photo`/`signature`/`invoice`; `file_url`/`file_size_bytes`/`file_mime_type` **nullable** ("schema-only in Phase 4 … file-upload infra still deferred"); `visibility`; `uploaded_by_user_id`. `job_contacts` (lines 33–60).
- **`job-history.ts`** — `job_status_history`, `job_priority_history`, `job_trade_history` (identical from→to shape), and `job_events` (unified timeline, `event_type` varchar open vocab, `metadata` JSON, `actor_user_id` nullable).

### §2e Vendor invoices (Phase 8 substrate)
- **`vendor-invoices.ts`** — `vendor_invoices` (lines 49–95): `source_type` enum **already includes `"vendor_portal"`** (line 34: `["manual","vendor_portal","email_ingestion","external_portal_sync","api"]`); `status` enum `["received","under_review","approved","disputed","paid"]` (line 40) — **no "draft"**; `assignment_id` nullable (ties invoice → dispatch for the NTE check); `exceeds_nte`/`nte_baseline_amount` writer-owned; `approved_by_user_id` is the operator AP control point. `vendor_invoice_line_items` (lines 98–109) via shared `baseLineItemColumns()`.
- `proposals` / `change_orders` exist (Phase 8) but are operator-side; not central to the vendor-portal MVP surface.

### §2f Audit logs
- **`audit-logs.ts`** — `audit_logs` (lines 13–40): nullable `tenant_id` + `user_id` (both SET NULL), `actor_label`, `action` varchar, `target_type`/`target_id`, `metadata` JSON, ip/userAgent. The cross-cutting actor trail.

---

## §3 Live DB schema (empirical)

`SHOW TABLES` returns **80 tables**. All load-bearing DDLs were captured during inspection; highlights:

- **No `vendor_users` table exists.** Grepping the table list for vendor+user combinations yields only `vendor_update_logs`, which is a **portal-content log** (cols: tenant_id, job_id, **nullable** vendor_id, content, received_at, status) — it carries no `user_id` and is not an auth linkage.
- **`users`** live columns: id, name, email, email_verified, image, created_at, updated_at — **no vendor_id**.
- **`tenant_users`** live columns: id, tenant_id, user_id, status, joined_at, updated_at — **no vendor_id**.
- **`roles`** data (live): `super_admin` (scope **global**); `accounting`, `client_user`, `operator`, `tenant_admin`, **`vendor_user`** (all scope **tenant**). **The `vendor_user` and `client_user` roles already exist** — seeded since the Phase 1 role model. (Note: `roles` keys on `key`, not `slug`/`name` as the paste-back's query assumed.)
- **`dispatch_assignment_statuses`** data (live), in sort order: `DRAFT`(draft), `SENT`(pending), `ACCEPTED`(active), `DECLINED`(cancelled,terminal), `SCHEDULED`(active), `CONFIRMED`(active), `ON_SITE`(active), `WORK_COMPLETE`(completed,terminal), `CANCELLED`(cancelled,terminal). This set fully enumerates the vendor-controllable assignment lifecycle.
- **`job_notes.visibility`** live enum = `('internal_only','vendor_visible','client_visible','client_and_vendor_visible','requires_review')`, default `internal_only`. Distinct values present in data: `internal_only`(1), `client_visible`(1), `requires_review`(1). **No `origin`/`created_by_role` column live** — matches drizzle.
- **`vendor_invoices.source_type`** live = `('manual','vendor_portal','email_ingestion','external_portal_sync','api')` — confirms `vendor_portal` is migration-applied, not just in TS.

Live DB and drizzle agree on every load-bearing table inspected. No drift between TS schema and applied migrations was found in the Phase 10 domain. **Tables found** (all 21 requested present): tenants, users, roles, user_roles, tenant_users, vendors, vendor_contacts, vendor_locations, job_vendor_assignments, job_vendor_assignment_status_history, vendor_check_ins, vendor_check_outs, vendor_eta_confirmations, dispatch_messages, job_notes, job_status_history, job_attachments, job_events, vendor_invoices, vendor_invoice_line_items, audit_logs. **Tables missing:** none of the 21. The notable *absent* table is `vendor_users` (never requested; confirmed not to exist).

---

## §4 Auth/session substrate

- **Stack:** `better-auth` with the drizzle adapter (`src/server/auth.ts:1–16`), `emailAndPassword` enabled, `autoSignIn`. better-auth writes to **our managed drizzle tables** (`user→users, session→sessions, account→accounts, verification→verifications`), not a separate auth-owned namespace. Session-create and user-create hooks write `audit_logs` rows (`auth.login`, `auth.user.created`).
- **Session resolution** (`src/server/auth-context.ts`): `getAuthContext()` (lines 41–103) is the single source of truth. It (a) reads the better-auth session via `auth.api.getSession({headers})`, (b) loads **memberships** by joining `tenant_users → tenants` for the user, (c) loads role rows via `user_roles → roles`, (d) resolves **`activeTenant`** from the `pm_active_tenant` cookie (falling back to the first active membership), (e) computes **`roleKeys`** = global roles + roles scoped to the active tenant. Returns `{user, sessionId, memberships[], activeTenant, roleKeys[], isSuperAdmin}`.
- **Guards:** `requireAuth()` (→ `/login`), `requireTenant()` (→ `/no-tenant` if no active membership), `requireRole(...keys)` (→ `/forbidden`; super_admin auto-passes), `enforceAccountingGate()`, `setActiveTenant()` (validates membership, sets cookie, audits `tenant.switched`).
- **`tenant_id` on the session** is attached purely through `tenant_users` membership + the active-tenant cookie. **There is no vendor-org dimension anywhere in the session** — `getAuthContext` has no concept of "which vendor org is this user".
- **Middleware:** neither `src/middleware.ts` nor `src/app/middleware.ts` exists. Gating is done in-layout/in-page via the `require*` guards, not edge middleware. (Consistent with Phase 1 `02-decisions`; no divergence to surface.)
- **Route groups:** `(app)` (shared aggregator shell), `(auth)/login`, plus top-level `forbidden` and `no-tenant`. `src/app/(app)/layout.tsx` calls `requireAuth()` and renders a hardcoded aggregator nav (Dashboard/Clients/Vendors/Jobs) + the active-tenant chip. **No `/vendor/*` or `/client/*` directories exist** — greenfield.

---

## §5 Role predicate substrate

- **`src/server/role-predicates.ts`** (Phase 9 9e) — pure, no IO. `type RoleCtx = {roleKeys:string[]; isSuperAdmin:boolean}`. `hasAnyRole(ctx, allowed[])` is the generic composer (super_admin always true). Named predicates `canSeeOperations(ctx)` = `["tenant_admin","operator"]`, `canSeeFinancials(ctx)` = `["accounting","tenant_admin"]`.
- **`src/server/billing/role-gates.ts`** (Phase 8 8c) — `isAccountingRole(roleKeys, isSuperAdmin)` = the write-side AP/AR gate.
- **Callsites:** `hasAnyRole`/`canSee*` are referenced only in `src/app/(app)/dashboard/page.tsx` (`requireTenant()` → `canSeeOperations`/`canSeeFinancials` booleans). `isAccountingRole` is consumed by `enforceAccountingGate` in auth-context + billing actions.
- **No vendor-side predicate exists.** There is no `isVendorUser`, and — critically — **no predicate takes an assignment or vendor argument** (e.g. `canActOnAssignment(user, assignment)`), because **there is no vendor-scope primitive in the session to compose against** (see §6). Every existing predicate keys off `roleKeys` alone.

---

## §6 Vendor-user linkage — current state

This is the highest-stakes finding. **There is no vendor↔user linkage in the system today, at any layer.**

- **No `vendor_users` join table** (drizzle or live DB).
- **`users` has no `vendor_id`**; **`tenant_users` has no `vendor_id`**. The only vendor+user-adjacent table, `vendor_update_logs`, links job↔vendor content with a nullable `vendor_id` and **no user reference** — it is not an identity linkage.
- The **`vendor_user` role exists and is seeded** (§3), and `getAuthContext` will happily return `roleKeys: ["vendor_user"]` for a user granted it — but nothing maps that user to a specific `vendors.id`. A `vendor_user` today is a role with **no scope target**.
- **The tenant-vs-row tension:** `tenants.type` admits `"vendor"`, so the schema anticipated vendor *tenants*. But `vendors` records are **rows scoped under the aggregator tenant** (`vendors.tenant_id` → the aggregator). These are two different representations of "a vendor", and they are not reconciled. A vendor user needs to (a) authenticate, (b) resolve to a `vendors` row, and (c) see jobs that live in the **aggregator's** tenant. Whether the vendor user holds a `tenant_users` membership in the aggregator tenant (with `vendor_user` role + a vendor-scope link) or in a separate vendor-type tenant is **unresolved** and is Fork 1 in the proposal.
- **Multiplicity is undecided:** nothing in the substrate forces one-user-one-vendor. A single contractor contact could plausibly serve multiple vendor orgs (or one vendor org across multiple aggregator tenants). The linkage table's cardinality is a design choice, not a constraint inherited from existing data.

**Verdict:** Phase 10 must introduce the vendor↔user linkage from scratch. This is the load-bearing schema decision of the phase; everything else (visibility scope, predicates, the `/vendor/jobs` reader) composes on top of it.

---

## §7 Phase 9 dashboard treatment of vendor data

- **Analytics layer** (`src/server/analytics/`, 9 modules): every reader takes **`tenantId: string` as its first parameter** and filters `eq(jobs.tenantId, tenantId)` (e.g. `timeToDispatchDistribution(tenantId)` at `dispatch-timing.ts:25–36`; `operationalQueue(tenantId, limit)`). The tenant-scoping primitive is uniform.
- Vendor data is surfaced **indirectly** today: `operationalQueue` joins `job_vendor_assignments` for an `assignmentCount` and joins through to `vendor_check_ins` for an on-site count (`operational-queue.ts:14–15` comment + body); `dispatch-timing.ts` measures time-to-dispatch. No reader is **vendor-scoped** (i.e. filtered by `assignment.vendor_id`).
- **Extensibility:** a `/vendor/jobs` reader is structurally a **tenant + vendor scoped** read — `WHERE jobs.tenant_id = ? AND assignment.vendor_id IN (…)`, joining through `job_vendor_assignments`. The existing pattern accommodates this by **adding a second scope parameter + an assignment join**; it does not need a fundamentally new primitive. What it *does* need is the vendor-id set, which must come from the §6 linkage (not present today). So: pattern extends cleanly; the missing piece is upstream (the vendor-scope resolver), not the reader shape.

---

## §8 Attachment/upload substrate

- **No upload infrastructure exists.** Searching `src/` for `S3 / cloudinary / uploadthing / multipart / presigned / blob` yields zero upload-handling code; the only `formData` matches are ordinary server-action form bodies, not file uploads.
- **`job_attachments`** (live) holds **0 rows**; `file_url` populated in 0/0. Schema-only since Phase 4 (`job-details.ts:91–93`). `vendor_documents` likewise carries nullable file columns (`vendor-details.ts:77–80`).
- **Prior-doc strategy:** `docs/phase-3-vendors/{02-decisions,10-known-limitations}.md` and `docs/phase-4-jobs/10-known-limitations.md` record file-upload infra as **explicitly deferred** ("L-3.2"); the schema landed file-metadata columns ahead of infra to avoid a backfill.
- **Verdict:** Phase 10 photo upload is greenfield. There is no backend to write a file to. This forces the Fork 7 decision toward a placeholder (matching the roadmap's "upload photo placeholder if practical").

---

## §9 Phase 8 vendor invoice substrate (read/write-side)

From §2e + §3:
- `vendor_invoices` is **ready to receive a portal submission today**: `source_type` enum already includes `vendor_portal`; a vendor submission would land with `source_type='vendor_portal'`, `status='received'` (the natural intake state — there is no "draft"), `assignment_id` set to the dispatch (enabling the NTE check via `agreed_nte_amount`), `created_by_user_id` = the vendor user.
- **Operator review is already modeled** as the status ladder `received → under_review → approved` + `approved_by_user_id`/`approved_at`. No new "review" plumbing is required for invoices — the existing AP control point *is* the operator-review surface.
- **Required vs nullable:** required = tenant_id, job_id, vendor_id, source_type, status, currency, subtotal/tax_total/total (default '0'), exceeds_nte (default false), payment_status (default 'unpaid'). Nullable = assignment_id, invoice_number, invoice_date, nte_baseline_amount, approved_by_user_id, notes, created_by_user_id. Totals are writer-owned (`recalculateVendorInvoiceTotals`, Phase 8 8c), **not** hand-set by a form.

---

## §10 Drift / surprises / inspection-time discoveries

The most important section — empirical truth over prose.

1. **Schema path drift.** The 10a paste-back (and any memory) assumed `src/db/schema/`. The live location is **`src/server/schema/`**. No `src/db/` exists. All Phase 10 instructions must target `src/server/schema/`.
2. **The vendor portal was pre-wired at two layers, phases ahead.** (a) The **`vendor_user` and `client_user` roles are already seeded** (Phase 1 role model). (b) **`vendor_invoices.source_type` already includes `vendor_portal`** (Phase 8 migration). The substrate anticipated this phase — Phase 10 inherits an unusually warm runway on roles and invoice intake.
3. **The presence/ETA tables were built operator-first, and Phase 10 flips the actor.** `vendor_check_ins`/`vendor_check_outs`/`vendor_eta_confirmations` are documented as "operator-recorded" (`dispatch-presence.ts:53–58`) with `recorded_by_user_id`/`confirmed_by_user_id`. In Phase 10 the *vendor user* becomes the actor writing these rows. The columns accommodate it (the user FK is generic), but the semantic shift — and the audit framing — is a real change from how Phase 5 conceived them.
4. **`dispatch_messages.direction` already carries `"inbound"`.** Phase 5 anticipated vendor→operator messages even though it only ever wrote `outbound`. A vendor-portal message would be the first `inbound` writer.
5. **`job_notes` has no origin discriminator.** It has `visibility` + `created_by_user_id` but **no `origin`/`created_by_role`** column. The acceptance criterion "vendor notes are captured as vendor-originated" cannot be satisfied by the current columns alone — vendor-origin must either be (a) inferred at read time from the author's role, or (b) backed by a new column. This is Fork 4 and is a genuine schema gap, not just a UI choice.
6. **The vendor↔user linkage is wholly absent (§6).** This is the single biggest gap and the gating decision for the entire phase.
7. **The tenant-vs-row representation of "a vendor" is unreconciled (§6).** `tenants.type='vendor'` exists but `vendors` is an aggregator-scoped row table. Phase 10 must pick one model for vendor-user identity.
8. **No edge middleware.** All gating is in-layout/in-page. A `/vendor` surface will gate the same way (a `(vendor)` layout calling a vendor guard), not via `middleware.ts`.
9. **Assignment status is a reference-table FK, not an enum.** Vendor status transitions must resolve `dispatch_assignment_statuses` by `code` (the established `getDispatchAssignmentStatusByCode` pattern) and dual-write `job_vendor_assignment_status_history` — they cannot just set a column.
10. **Paste-back query-shape mismatches (minor, non-blocking).** The Step 3 `roles` query used `slug, name`; the live table keys on `key, label`. The Step 1 expectation of an exact `d6f6a58` short-hash held. Neither affects findings.

No stop-trigger fired during inspection; every question the steps raised is answerable and is carried into the proposal as a fork.
