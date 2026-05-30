# 10b Decisions Locked — Phase 10 Vendor Portal

## Purpose
Locks the 10 forks surfaced in 10a-design-proposal.md. Captures three
Decisions-of-Record that downstream sub-batches and future readers must
treat as binding. Updates the forward-bank with FB-10a.5a and FB-10a.5b
(capabilities deferred out of Phase 10 MVP per roadmap §8 scope).

## §1 Locked forks

### Fork 1 — Vendor-user linkage: new vendor_users join table
Shape: (id, tenant_id, user_id, vendor_id, created_at, updated_at)
Constraints:
  - UNIQUE (tenant_id, user_id, vendor_id)
  - FK user_id → users.id (ON DELETE CASCADE; vendor membership dies with user)
  - FK vendor_id → vendors.id (ON DELETE CASCADE; vendor membership dies with vendor)
  - FK tenant_id → tenants.id (ON DELETE CASCADE; multi-tenant containment)
Semantics: many-to-many. A vendor user holds:
  (a) a normal tenant_users row in the aggregator tenant
  (b) the vendor_user role granted in user_roles
  (c) one or more vendor_users mapping rows scoping their visibility
Rationale: rejects users.vendor_id (would force single-vendor users; future
vendor companies serving multiple aggregator tenants need many-to-many).
Rejects tenant_users overload (mixes role-membership with vendor-scope and
breaks the clean tenancy/identity boundary). Rejects vendor-as-tenant (see
DoR-10b.1).

### Fork 2 — Login surface: shared /login, role-routed redirect
Single auth backend. Post-auth resolver checks user roles in the active
tenant context: if user has vendor_user role, redirect to /vendor; else
redirect to /dashboard. No /vendor/login route in Phase 10.

### Fork 3 — Vendor data visibility scope: per vendor-organization
Within the active aggregator tenant. getVendorScope(ctx) reads vendor_users
rows for (ctx.userId, ctx.tenantId) and returns Set<vendorId>. All vendor-
portal readers filter `vendor_id IN scope` on job_vendor_assignments (and
derived joins to jobs).

### Fork 4 — Vendor note origin: extend job_notes with origin column
Migration (Phase 10): ALTER TABLE job_notes ADD COLUMN origin VARCHAR(16)
NOT NULL DEFAULT 'operator'. Allowed values: 'operator', 'vendor'.
Vendor writes: origin='vendor', visibility='internal_only' by default.
Operator promotes by updating visibility (no origin mutation). See DoR-10b.2
for migration safety.

### Fork 5 — Vendor-controlled assignment status transitions
Vendor may transition through: ACCEPTED, DECLINED, CONFIRMED (with ETA),
ON_SITE, WORK_COMPLETE. Vendor may NOT transition to CANCELLED (operator-
only). Every vendor-driven status write dual-writes to
job_vendor_assignment_status_history (see DoR-10b.3). Transitions resolve
by reference-table code lookup against dispatch_assignment_statuses;
current_status_id on job_vendor_assignments is updated by code, not by
enum mutation.

### Fork 6 — Operator review of vendor updates: hybrid via existing substrate
No new operator-review-queue table.
  - Status updates: auto-apply on vendor write. Operator review = timeline
    view on job detail page (existing substrate).
  - Notes: vendor writes default origin='vendor' + visibility='internal_only'.
    Operator review = filter by origin='vendor' in operator UI, promote by
    visibility update.
  - Photos: vendor writes job_attachments row, default visibility='internal_only'
    (mirrors notes pattern).
  - Invoices: vendor writes vendor_invoices status='received'. Operator review
    flows through the existing Phase 8 status ladder
    (received → under_review → approved/rejected). No new queue.

### Fork 7 — Photo upload: placeholder, metadata-row variant
Vendor "upload" action writes a job_attachments row with file storage
columns null and a placeholder flag (e.g. upload_pending=true OR
storage_status='pending'). No actual file persistence in Phase 10. Real
upload backend deferred (see FB-10a.4 in forward-bank). UI shows "Photo
attached (placeholder)" state.

### Fork 8 — Vendor invoice submission: basic form to vendor_invoices
Vendor submits via /vendor/invoices/new form. Writes vendor_invoices with:
  - source_type = 'vendor_portal' (already a live enum value)
  - status = 'received' (entry point of existing Phase 8 status ladder; no
    'draft' state — that value is not in the live status set)
  - totals computed by writer (line-item sum), not user-entered
  - assignment_id and job_id resolved via vendor scope
Form supports minimal line items in MVP; complex line-item editing deferred
to a later phase.

### Fork 9 — Route structure: new (vendor) route group with own layout
Layout: src/app/(vendor)/layout.tsx with requireVendor() guard at top.
Guard redirects non-vendor-role users to /dashboard with a flash; redirects
vendor users with empty vendor scope to a "no assigned vendors yet" empty
state (vendor user without any vendor_users mapping rows).

### Fork 10 — Vendor role predicates (composes over role-predicates.ts)
Pure (input → output, no I/O):
  - isVendorUser(roles: string[]): boolean
  - canActOnAssignment(scope: Set<vendorId>, assignment: { vendor_id }): boolean
  - canSubmitVendorInvoice(scope, assignment): boolean
Impure (reads DB):
  - getVendorScope(ctx: AuthContext): Promise<Set<vendorId>>
Guard (route-level):
  - requireVendor(): asserts session has vendor_user role + non-empty scope,
    throws Redirect to /dashboard or /vendor/no-access otherwise

## §2 Decisions-of-Record (binding)

### DoR-10b.1 — tenants.type='vendor' is vestigial and unused
The tenants.type enum carries 'vendor' as a value, but Phase 10 does NOT
treat vendor organizations as tenants. Vendor users are aggregator-tenant
members. Future readers/chatbots inspecting the schema must NOT conclude
from this enum value that vendors should be promoted to tenants. Cleanup
of the unused enum value is a future schema-hygiene concern, not Phase 10
scope.

### DoR-10b.2 — job_notes.origin migration is safe additive
ALTER TABLE job_notes ADD COLUMN origin VARCHAR(16) NOT NULL DEFAULT
'operator'. MariaDB applies the default to existing rows at column-add
time. All pre-Phase-10 job_notes rows are operator-authored (no vendor
portal existed), so the default is semantically correct, not a lossy
approximation. No backfill script needed.

### DoR-10b.3 — All vendor-driven status writes dual-write history
Every vendor-controlled transition on job_vendor_assignments MUST insert a
row into job_vendor_assignment_status_history capturing
(assignment_id, from_status_id, to_status_id, actor_user_id, source='vendor_portal',
occurred_at). Overwrite-only writes are prohibited. This mirrors Phase 9's
dual-population principle (current state + history).

## §3 Forward-bank — Phase 10 inventory

### Items seeded in 10a (carried forward)
- FB-10a.1 — Vendor user invite flow (admin creates user + maps to vendor)
- FB-10a.2 — Branded vendor login page (post-MVP polish)
- FB-10a.3 — Operator-side vendor-updates inbox view
- FB-10a.4 — Real photo upload backend (S3 / object storage)
- FB-10a.5 — Vendor capability scope per roadmap §2.3 vs §8 (now split, below)
- FB-10a.6 — Vendor invoice draft state (if a future draft phase is added
  to the status ladder)
- FB-10a.7 — Vendor-scoped analytics readers (vendor performance, etc.)

### Items added by 10b
- FB-10a.5a — NTE-increase request flow (vendor → operator approval).
  Substrate question open: typed dispatch_messages variant vs new
  nte_change_requests table. Deferred out of Phase 10 MVP per strategic
  chat ruling 2026-05-29.
- FB-10a.5b — Vendor quote submission (writes Phase 8 proposals substrate,
  status=draft). Deferred out of Phase 10 MVP. Likely Phase 10.5 or 11.5
  slice.
- FB-10b.1 — tenants.type='vendor' enum cleanup (DoR-10b.1 cited; not
  Phase 10 scope)

## §4 Out-of-scope reminders (Phase 10 do-NOT)
- Client portal (Phase 11)
- External portal sync (Phase 12)
- Email parser (Phase 13)
- Full AI automation
- Real photo upload backend (FB-10a.4)
- NTE-increase request flow (FB-10a.5a)
- Vendor quote submission (FB-10a.5b)
- Vendor-scoped analytics readers (FB-10a.7)
- Operator-side vendor-updates inbox as a dedicated view (FB-10a.3 — review
  happens through existing job detail + invoice list surfaces in MVP)

## §5 What 10c opens
Construction begins with the vendor-user linkage migration plus its drizzle
schema entry, since every Phase 10 surface depends on getVendorScope being
resolvable. 10c paste-back will arrive after this commit lands and Jonny
signals go.
