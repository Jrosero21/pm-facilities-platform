# 10a Design Proposal — Phase 10 Vendor Portal forks

## Purpose

This doc surfaces the consequential decisions for Phase 10 (Vendor Portal MVP). Each fork has options, tradeoffs, and a recommended default grounded in `10a-inspection-report.md`. **No decision is locked until 10b.** Where a recommendation depends on an upstream fork (notably Fork 1), that dependency is stated.

Source anchors: roadmap §2.3 (vendor portal is core) + §8 Phase 10 (deliverables/acceptance); the inspection report sections cited inline (`IR §N`).

---

## Fork 1 — Vendor-user linkage model

**The gating decision of the phase.** There is no vendor↔user linkage today (IR §6). Everything else composes on top of whatever we pick here.

**Options:**
- **A. New `vendor_users` join table** (`user_id`, `vendor_id`, `tenant_id`, status, role-ish metadata) — many-to-many.
- **B. Add `vendor_id` column to `users`** — many-to-one (each user serves exactly one vendor).
- **C. Extend `tenant_users` with a nullable `vendor_id`** — populated when the membership's role is `vendor_user`.
- **D. Model each vendor org as a `tenants.type='vendor'` tenant**, and rely on existing `tenant_users` membership for scope.

**Tradeoffs:**
- **B** pollutes the better-auth-managed `users` table with a domain FK and hard-caps a user to one vendor org — fragile if a contractor ever serves two vendors, and it couples auth identity to facilities domain. Reject.
- **D** fights the live substrate: `vendors` is an **aggregator-tenant-scoped row table** (IR §2b/§6), and all the jobs/assignments a vendor must see live in the **aggregator's** tenant. Making the vendor its own tenant means cross-tenant reads (vendor tenant → aggregator tenant data), which the current tenant-scoped reader pattern (IR §7) actively forbids. Large architectural detour for the MVP. Defer the vendor-tenant idea to a later phase if ever needed.
- **C** is cheap but overloads `tenant_users` semantics (a membership row that sometimes carries a vendor scope, sometimes not) and still can't express a user serving two vendor orgs within one tenant. Workable but muddy.
- **A** mirrors the platform's established join-table idiom (`user_roles`, `tenant_users`), keeps auth tables clean, supports many-to-many (one user ↔ many vendors; one vendor ↔ many staff users), and gives the `/vendor/jobs` reader exactly the `vendor_id` set it needs (IR §7). It also sets the **symmetry template** for the Phase 11 client portal (`client_users`).

**Recommendation: A — new `vendor_users` join table.** Columns: `id`, `tenant_id` (the aggregator tenant that owns the vendor), `user_id` → users, `vendor_id` → vendors, `status` (active/invited/suspended, mirroring `tenant_users`), `created_by_user_id`, timestamps; unique on (tenant_id, user_id, vendor_id). The vendor user **also** holds a `tenant_users` membership in that aggregator tenant + a `vendor_user` role grant — so `getAuthContext` resolves them into the aggregator tenant normally, and `vendor_users` adds the vendor-scope on top. This keeps the existing session machinery untouched and adds one resolver (`getVendorScope(ctx) → vendorId[]`).

*Open sub-question for 10b:* do we seed an invited-status flow now, or assume operators create vendor users directly? Recommend **direct creation in MVP**, invite flow banked.

---

## Fork 2 — Vendor session & login surface

**Options:**
- **A. Shared `/login`** with role-routed post-auth redirect (vendor users → `/vendor`, aggregator users → `/dashboard`).
- **B. Separate `/vendor/login`** — same better-auth backend, distinct entry page.
- **C. Subdomain split** (`vendors.…`) — out of scope for MVP.

**Tradeoffs:** better-auth issues one session cookie for the app (IR §4); there is no cookie-scope benefit to a separate route. A second login page is extra surface that authenticates against the identical backend and then has to role-route anyway. Subdomain split is real infra (cookie domains, deploy) — not MVP. The only argument for B is *vendor-facing branding*, which the MVP doesn't need.

**Recommendation: A — shared `/login`, role-routed redirect.** Post-auth (or at `/` and at the `(app)` vs `(vendor)` layout boundary): if the resolved `roleKeys` contain `vendor_user` and **no** aggregator role, land them in `/vendor`; aggregator users land in `/dashboard`. A vendor user hitting an `(app)` aggregator route gets `/forbidden` (or redirected to `/vendor`) via the vendor guard. Banked: branded `/vendor/login` if a real vendor-onboarding need appears.

---

## Fork 3 — Vendor data visibility scope

**Options:**
- **A. Per-assignment** — vendor sees only the specific `job_vendor_assignments` rows assigned to their vendor.
- **B. Per vendor-organization** — vendor sees all assignments where `assignment.vendor_id ∈ user's vendor orgs` (from `vendor_users`).
- **C. Per tenant-vendor relationship** — scoped through tenant context.

**Tradeoffs:** A and B describe the **same row set** (an assignment belongs to a vendor); the real question is the *unit of scoping*. The natural unit is the **vendor organization**: multiple staff users of one vendor should all see that vendor's assignments, not just ones individually addressed to them (assignments have a `vendor_contact_id`, not a vendor-*user* FK — IR §2c). C is subsumed: the tenant is already fixed by the session (IR §4), so vendor scope is *within* the active tenant, not a replacement for it.

**Recommendation: B — per vendor-organization, within the active (aggregator) tenant.** The `/vendor/jobs` reader filters `jobs.tenant_id = activeTenant AND job_vendor_assignments.vendor_id IN getVendorScope(ctx)`. This is exactly the "tenant + vendor scoped read" the existing analytics pattern extends to (IR §7). Multi-vendor-org users (Fork 1-A many-to-many) naturally see the union across their vendor orgs. **A vendor never sees a job that has no assignment to their vendor** — satisfying the acceptance criterion "vendor sees assigned jobs only."

*Edge case for 10b:* a job with multiple vendor assignments (multi-trade / re-dispatch — explicitly allowed, IR §2c) is visible to each assigned vendor, each seeing **only their own assignment row**, not the others'. The reader must scope the assignment join, not just the job.

---

## Fork 4 — Vendor note origin model

**The genuine schema gap (IR §10.5).** `job_notes` has `visibility` + `created_by_user_id` but **no origin/role discriminator**. The acceptance criterion "vendor notes captured as vendor-originated" needs an answer.

**Options:**
- **A. Same `job_notes` table + new `origin` column** (`operator`|`vendor`|`client`|`system`), vendor notes default `visibility=internal_only`; operator promotes visibility.
- **B. Separate `vendor_notes` table** operators copy/promote into `job_notes` when client-bound.
- **C. `job_notes` + `created_by_role` discriminator** (no separate origin field) — derive origin from the author's role at write time.
- **D. Infer origin at read time** from `created_by_user_id`'s role (no schema change).

**Tradeoffs:** B fragments the job timeline into two tables and forces a copy/promote step — it fights the handoff's central tension ("vendor writes must respect Phase 9's read substrate"). D is fragile: a user's roles can change, and inferring historical origin from current role is wrong (a user who was a vendor_user then became an operator would retro-rewrite history). C and A are close; the difference is whether we record **who they were acting as** (origin, an explicit captured fact) vs **their role** (created_by_role, which conflates identity and provenance). Origin is the cleaner provenance axis and composes with the existing `visibility` axis.

**Recommendation: A — single `job_notes` table + a new `origin` column** (default `operator`), vendor-portal note writes set `origin='vendor'`, `visibility='internal_only'`. Operators promote visibility (`internal_only → client_visible`) through the existing aggregator note UI. This: reuses the Phase 9 read substrate (one timeline, one reader), captures origin as an immutable fact at write time, keeps the default-not-client-facing acceptance criterion as a column default, and forward-points to Phase 11 (`origin='client'`). It is a **small additive migration** (one enum column with a safe default — no backfill risk since vendor rows don't exist yet). Same column should be added to `job_attachments` (vendor photos) and is already effectively present on `dispatch_messages` via `direction`.

---

## Fork 5 — Vendor-side assignment status update flow

The live `dispatch_assignment_statuses` set (IR §3) maps cleanly to vendor actions. Status is a reference-table FK resolved by `code`, dual-writing `job_vendor_assignment_status_history` (IR §10.9).

**Proposed vendor-controlled transitions** (all write through the history table + an audit row, mirroring the existing `getDispatchAssignmentStatusByCode` + dual-write pattern):

| Vendor action | Transition | Side-write |
|---|---|---|
| Accept dispatch | `SENT → ACCEPTED` | history |
| Decline dispatch | `SENT → DECLINED` (terminal) | history |
| Confirm schedule | `SCHEDULED → CONFIRMED` | history |
| Update ETA | (no status change) | `vendor_eta_confirmations` row (`confirmed_by_user_id` = vendor user) |
| Mark on-site | `CONFIRMED → ON_SITE` | history + `vendor_check_ins` row (`recorded_by_user_id` = vendor user) |
| Mark work complete | `ON_SITE → WORK_COMPLETE` (terminal) | history + `vendor_check_outs` row |

**Notes / 10b questions:**
- `SCHEDULED` is reached when a schedule is set; whether the vendor or operator sets the initial schedule (and thus who moves `ACCEPTED → SCHEDULED`) needs a 10b ruling. Recommend: vendor's ETA confirmation can drive `ACCEPTED → SCHEDULED`, or the operator schedules — lock in 10b.
- Vendor transitions are **forward-only** along the lifecycle; no vendor-initiated `CANCELLED` (operator-only cancellation). Decline is the vendor's only "back out," and only from `SENT`.
- The actor flips from operator to vendor on the presence/ETA tables (IR §10.3) — columns accommodate it; the audit `actor_label` should record the vendor context.

**Recommendation:** vendor controls accept/decline/confirm/eta/on-site/complete as above; **all auto-apply** (no operator approval gate on status — see Fork 6); every transition dual-writes history; no vendor access to `CANCELLED`.

---

## Fork 6 — Operator review of vendor updates

**Options:**
- **A. Auto-apply with audit trail** — vendor updates land immediately; operator sees them retroactively.
- **B. Pending-review queue** — updates land in a queue; operator approves before they take effect.
- **C. Hybrid** — status updates auto-apply; notes/visibility gated; invoices gated.

**Tradeoffs:** Roadmap §2.3 is "capture-first, review-later." A full pending-review queue (B) needs a new queue table and a two-phase write for *every* vendor action — heavy for an MVP and contrary to capture-first. But "vendor updates do not automatically become client-facing unless allowed" (acceptance) is a real gate. The resolution: the gate is **visibility**, not **existence**. Vendor data lands immediately (auto-apply); what's gated is whether it becomes *client-facing*, which the existing `visibility` axis already governs.

**Recommendation: C (hybrid), realized through existing substrate — no new queue table:**
- **Status transitions:** auto-apply (Fork 5), recorded in history + audit. Operator review = reading the timeline.
- **Notes/photos:** auto-apply but **default `visibility=internal_only`** (Fork 4). They exist immediately and are operator-visible; they only reach the client when an operator promotes visibility. This *is* the "not client-facing unless allowed" gate.
- **Invoices:** land as `status='received'` (Fork 8); the existing AP ladder `received → under_review → approved` + `approved_by_user_id` (IR §9) *is* the operator review. No new plumbing.

So "operator can review vendor updates" is satisfied by (a) the assignment-status history timeline, (b) the visibility-promotion control on notes/attachments, and (c) the invoice approval ladder — all already in the substrate. **Banked:** a dedicated "vendor updates" review queue/inbox as a Phase-10-later or Phase-11 convenience if operators want a single pane (forward-bank §11).

---

## Fork 7 — Photo upload approach

**Options:**
- **A. Placeholder UI only** — no upload backend.
- **B. Sandbox-only local-filesystem stub** — functional but not production-deployable.
- **C. Real upload infrastructure** — out of MVP scope.

**Tradeoffs:** No upload infra exists anywhere (IR §8); `job_attachments` is schema-only with 0 rows; file-upload was explicitly deferred since Phase 3 (L-3.2). Real infra (C) is a phase of its own (storage provider, signed URLs, validation, virus scanning). A local-FS stub (B) creates a sandbox-only path that doesn't survive deploy and risks being mistaken for real.

**Recommendation: A — placeholder UI only**, matching the roadmap's "upload photo placeholder if practical." The vendor job-detail page shows a photo-upload affordance that is visibly non-functional (disabled, "coming soon") OR creates a `job_attachments` metadata row with `origin='vendor'`, `attachment_type='photo'`, and **null file columns** (a record-without-file, consistent with how the schema already tolerates null `file_url`). Recommend the **metadata-row variant** so the timeline can show "vendor attempted to attach a photo" and the real-upload phase backfills the file. **Real upload backend is explicitly deferred** (out-of-scope §12).

---

## Fork 8 — Vendor invoice submission shape

**Options:**
- **A. Basic form writing directly to `vendor_invoices`** (Phase 8 schema) with an intake status.
- **B. Placeholder form only, no DB write.**
- **C. Form writes to `vendor_invoices` + queues operator review.**

**Tradeoffs:** The substrate is unusually ready (IR §9): `source_type='vendor_portal'` already exists; the status ladder + `approved_by_user_id` already model operator review (so C's "queue" is already there, no new table). B wastes a warm runway. The only caution: totals are **writer-owned** (`recalculateVendorInvoiceTotals`) — the form must submit line items and let the recalc writer set subtotal/tax/total + the NTE check, not hand-set totals.

**Recommendation: A, which collapses into C via the existing ladder.** Vendor submits a basic invoice form (invoice number, date, line items) → writer creates a `vendor_invoices` row with `source_type='vendor_portal'`, `status='received'`, `assignment_id` set (enabling the NTE check against `agreed_nte_amount`), `created_by_user_id` = vendor user → `recalculateVendorInvoiceTotals` sets totals + `exceeds_nte` in the same txn. Operator review is the existing `received → under_review → approved` ladder (Fork 6). **Note:** the paste-back's "status=draft-pending-review" is not a live value — the live enum has no `draft`; `received` is the correct intake state (IR §9). If a true pre-submit draft state is wanted, that's an enum addition to decide in 10b — recommend **not** adding it for MVP.

---

## Fork 9 — Route structure

**Options:**
- **A. `/vendor/*` under the existing `(app)` route group.**
- **B. New `(vendor)` route group with its own layout.**
- **C. New top-level layout segment.**

**Tradeoffs:** The `(app)` layout calls `requireAuth()` and renders a **hardcoded aggregator nav** (Dashboard/Clients/Vendors/Jobs) + assumes aggregator context (IR §4). Putting vendor pages under `(app)` means vendor users would inherit that aggregator chrome unless heavily conditionalized — messy and leak-prone. A `(vendor)` group gets its own layout (vendor nav: My Jobs / Submit Invoice / Profile), its own guard (`requireVendor()` → resolves vendor scope or `/forbidden`), and clean separation. There's no edge middleware to complicate either way (IR §4/§10.8).

**Recommendation: B — new `(vendor)` route group** with its own `layout.tsx` calling a new `requireVendor()` guard (composes `requireTenant()` + `isVendorUser` + `getVendorScope` non-empty). Routes: `(vendor)/vendor/jobs`, `(vendor)/vendor/jobs/[id]`, `(vendor)/vendor/invoices/new`, `(vendor)/vendor/profile`. This mirrors the `(app)`/`(auth)` grouping idiom already in the tree and sets the Phase 11 `(client)` template.

---

## Fork 10 — Vendor role predicates

Compose over the existing pure `role-predicates.ts` (`RoleCtx`, `hasAnyRole`) — do **not** create a parallel system (IR §5). New predicates:

- **`isVendorUser(ctx: RoleCtx): boolean`** = `hasAnyRole(ctx, ["vendor_user"])`. Pure, mirrors `canSeeOperations`.
- **`getVendorScope(ctx): Promise<string[]>`** — the one **impure** addition (reads `vendor_users` for the user in the active tenant → vendor_id[]). Lives server-side (not in the pure predicate file); it's the missing vendor-scope primitive (IR §5/§6). Returns `[]` for non-vendor users.
- **`canActOnAssignment(vendorScope: string[], assignment: {vendorId: string}): boolean`** = `vendorScope.includes(assignment.vendorId)`. Pure, takes the resolved scope (not the DB) so it's unit-testable — mirrors how `isAccountingRole` takes `roleKeys` rather than reading session.
- **`canSubmitVendorInvoice(vendorScope, assignment)`** = `canActOnAssignment(...)` (same gate; invoices are per-assignment).
- **`requireVendor()`** (auth-context guard) = `requireTenant()` → assert `isVendorUser` → resolve `getVendorScope` non-empty, else `/forbidden`.

**Composition principle:** the pure predicates stay pure and assignment-shaped (take already-resolved scope), the impure resolver is isolated, and the guard ties them together — exactly the `isAccountingRole`/`enforceAccountingGate` split already on the platform. No drift from `role-predicates.ts`.

---

## §11 Forward-bank (banked items to track across 10c+)

- **FB-10a.1** — Vendor-user **invite flow** (invited→active). MVP creates vendor users directly; invite/onboarding banked (Fork 1).
- **FB-10a.2** — Branded **`/vendor/login`** entry. MVP shares `/login` (Fork 2).
- **FB-10a.3** — Dedicated **operator "vendor updates" review inbox** (single-pane). MVP uses the existing timeline + visibility + invoice ladder (Fork 6).
- **FB-10a.4** — **Real photo-upload backend** (storage + signed URLs). MVP is a placeholder/metadata-row (Fork 7).
- **FB-10a.5** — Vendor-initiated **NTE-increase request** + **quote submission** (roadmap §2.3 lists both). Not in the §8 Phase 10 deliverables; confirm scope in 10b — likely banked to a later vendor-portal iteration.
- **FB-10a.6** — Possible **pre-submit invoice `draft` state** if operators want vendors to stage invoices (Fork 8). MVP uses `received`.
- **FB-10a.7** — Vendor-scoped **analytics readers** (extend the Phase 9 harness for `/vendor/jobs` counts) per the co-versioning contract.

---

## §12 Out-of-scope reminders (do-NOT)

- **Client portal** (Phase 11) — including any `client_users` table beyond noting the symmetry.
- **External portal sync** (Phase 12) — ServiceChannel et al.; the app stays source-agnostic.
- **Email parser / ingestion** (Phase 13).
- **Full AI automation.**
- **Real photo-upload backend** — deferred (Fork 7 lands on placeholder; FB-10a.4).
- **Vendor-tenant remodeling** — do not turn vendor orgs into `tenants.type='vendor'` tenants for the MVP (Fork 1 rejects D).
- **Hand-setting invoice totals** — totals are writer-owned (Fork 8).
