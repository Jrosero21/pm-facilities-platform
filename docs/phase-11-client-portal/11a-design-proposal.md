# 11a Design Proposal — Phase 11 Client Portal forks

Surfaces the consequential decisions for the Client Portal MVP. Each fork states the **empirical finding** from `11a-inspection-report.md`, the **options**, and a **recommended default** — but **all are UNRESOLVED pending Jonny**; nothing is locked until 11b. Phase 10's vendor portal is the working template; most forks resolve to "mirror the vendor decision unless a client-specific reason diverges."

**Overall shape:** Phase 11 needs **one new table** (`client_users`, Fork 1 → migration `0027`) and **no other schema** (Forks 4–7 reuse existing substrate; Fork 5 needs no migration). The one genuinely-new surface is client **job origination** (Fork 4).

---

## Fork 1 — `client_users` linkage table
**Finding:** `client_users` is absent (live + code); `clients` is tenant-scoped uuidv7-PK (mirrors `vendors`); `client_user` role is seeded.
**Options:** (A) new `client_users (id, tenant_id, user_id, client_id, created_at, updated_at)`, many-to-many, all FKs cascade, unique `(tenant_id, user_id, client_id)` + index `(tenant_id, client_id)` — the exact `vendor_users` twin (migration `0027`). (B) reuse `tenant_users` with a nullable `client_id`. (C) a `users.client_id` column.
**Recommended default:** **A** — byte-for-byte the `vendor_users` decision (Phase 10 Fork 1 / `DoR-10b.1`), same rejections (B overloads `tenant_users`; C pollutes the auth table). A client user holds a `tenant_users` membership + `client_user` grant + ≥1 `client_users` row. **UNRESOLVED.**

## Fork 2 — `getClientScope` / `requireClient` auth substrate
**Finding:** `getVendorScope(userId, tenantId) → Promise<Set<string>>` (`vendor-scope.ts`) and `requireVendor() → VendorAuthContext` (`auth-context.ts`) are the templates; predicates live in `role-predicates.ts`.
**Options:** (A) author `src/server/client-scope.ts` (`getClientScope`) + `requireClient()` in `auth-context.ts` (returns `TenantAuthContext & { clientScope }`) + `isClientUser`/`canActOnClientJob` in `role-predicates.ts` — direct twins. (B) generalize the vendor primitives into a shared `getScope(table, col)` both portals call.
**Recommended default:** **A** — mirror, don't prematurely generalize (B couples two portals before the second exists; refactor-to-shared is cheap later if a third arrives). **UNRESOLVED.**

## Fork 3 — Client session resolution + role-routed redirect
**Finding:** the role-routing shim is in `(app)/layout.tsx` (vendor_user + non-empty scope + no operator role → `/vendor/jobs`); redirect targets are top-level static pages (`/vendor-no-access`).
**Options:** (A) extend the `(app)/layout.tsx` shim with a client branch (client_user + non-empty client scope + no operator role → `/client/jobs`), add top-level `/client-no-access`. (B) a separate middleware.
**Recommended default:** **A** — mirror Fork 2/3 of Phase 10 exactly (no middleware in the codebase; `DoR` carry-forward). Precedence question for 11b: a user who is *both* vendor_user and client_user (rare) — recommend operator-class first, then vendor, then client, else by which scope is non-empty; or simply default to `/dashboard` and let direct-nav choose (the `FB-10i.1` switcher covers this). **UNRESOLVED.**

## Fork 4 — Client job-submission flow (the one new surface)
**Finding:** `createJob` accepts `sourceType` and already guards `CLIENT_NOT_FOUND`/`LOCATION_NOT_FOUND`/`LOCATION_CLIENT_MISMATCH`; `internal_client_portal` is a live `source_type`.
**Options:** (A) thin wrapper `submitClientJob({ clientScope, actorUserId, clientLocationId, problemDescription, … })` → `requireClient` + pin `clientId` from scope (single-client users: the lone scope id; multi-client users: a client picker, validated `∈ scope`) → `createJob({ sourceType:'internal_client_portal', … })`. (B) call `createJob` directly from the action.
**Recommended default:** **A** (the 10n wrap-an-existing-writer pattern) — the wrapper is where the scope-pinning + `clientId ∈ scope` validation lives (never trust a form clientId). Open sub-questions for 11b: which fields the client form exposes (problem description required; trade/priority — let operators triage, so **omit** from the client form, default null); whether a client may pick a location (yes — from their client's `client_locations`). **UNRESOLVED.**

## Fork 5 — Client note visibility filter + the `origin='client'` question
**Finding:** `job_notes.visibility` includes `client_visible` + `client_and_vendor_visible`; **`origin` is `varchar(16)`, not an enum** → adding `'client'` needs **no migration**.
**Options for the read filter (symmetric to `DoR-10l.2`):** a client sees a note iff `visibility ∈ ('client_visible','client_and_vendor_visible')` OR (`origin='client'` AND author ∈ client-user-scope subquery). **Options for client *writes*:** (A) clients can add notes → `origin='client'`, `visibility='internal_only'` default (reuses the varchar origin; no migration; `DoR-10m.1`'s third actor-class — now `origin` *does* discriminate operator/vendor/client, exactly the case the column exists for). (B) clients read-only on notes in MVP (roadmap §8 lists "client-visible updates," not "client notes").
**Recommended default:** **read filter as above; client note *writing* = (B) read-only for MVP** (roadmap §8 says clients *view* client-visible updates; authoring client notes is not a listed deliverable). If client write is wanted, (A) is migration-free. Either way **no `0027`-for-origin** — the varchar already accepts `'client'`. **The load-bearing dependency:** "client-visible updates" require operators to be able to *mark* updates client-visible — i.e. **`FB-10l.2` (operator visibility-promotion) likely becomes a Phase 11 prerequisite**, since Phase 10 deferred it and the client portal is the consumer that needs it. Flag prominently. **UNRESOLVED.**

## Fork 6 — Proposal approval (client accept)
**Finding (corrected):** the writer is **`recordProposalAcceptance`** (not approve/reject); the lifecycle is draft→sent→viewed→**accepted**; there is **no client-reject writer** (operator `withdrawProposal`/`createProposalRevision` is the decline path).
**Options:** (A) client "approve" wraps `recordProposalAcceptance` (`requireClient` + the proposal's job ∈ client scope); client decline = **not built** (operator handles via withdraw/revise) — matches the existing lifecycle, no new writer. (B) author a client-reject/decline writer (new Phase 8 surface) so clients can actively decline.
**Recommended default:** **A** — approve-only, wrapping the existing writer; decline stays operator-mediated (roadmap §8 says "proposal approval placeholder or basic flow," not "reject"). Banks a `FB` for client-decline if real demand surfaces. Also lock: does the client see a "viewed" transition (mark-viewed on open)? Recommend yes if `recordProposalAcceptance` or a sibling sets `viewed` — 11b confirms against the live lifecycle. **UNRESOLVED.**

## Fork 7 — Invoice visibility (read-only)
**Finding:** `getClientInvoice` / `listClientInvoicesForJob` / `listClientInvoiceLineItems` readers exist; client invoices have a status lifecycle (drafts operator-internal).
**Options:** (A) a client-scoped reader (`listClientInvoicesForClient` or per-job) filtering `client_id ∈ scope` AND `status` ∈ client-visible set (e.g. `sent`/`paid`, not `draft`/`void`). (B) reuse `listClientInvoicesForJob` directly with a scope guard.
**Recommended default:** **A**, a thin client-scoped reader (the status filter is the new decision — recommend exclude `draft`/`void`). Read-only; the client portal writes no invoices. **UNRESOLVED** (the exact visible-status set is the call).

## Fork 8 — Client harness
**Finding:** `check-vendor-predicates.ts` (61 assertions, seed-dependent, destructive) is the template; the seed is now Phase-9+10 (`FB-10p.1` pending rename).
**Options:** (A) new `scripts/check-client-predicates.ts` (its own file, mirroring the vendor harness) + extend the seed/fixture with a client user + `client_users` mapping + a client-submitted job + client-visible notes. (B) extend `check-vendor-predicates.ts` to also cover client predicates (one harness).
**Recommended default:** **A** — a separate `check-client-predicates.ts` (clean domain separation; the vendor harness stays frozen with Phase 10). Co-version it with the same seed (which Fork-1/4 fixtures extend). Possibly discharge `FB-10p.1` (rename the seed to a phase-agnostic name) as part of this. **UNRESOLVED.**

---

## §9 Cross-cutting notes for 11b

- **Only one migration** (`0027`, `client_users`). Origin needs none (varchar). The cadence is the proven sandbox→prod→commit discipline (`04-admin-sop`).
- **`FB-10l.2` is the watch item** — "client-visible updates" (roadmap acceptance criterion) presuppose operators can make updates client-visible, which Phase 10 deferred. 11b should decide whether Phase 11 finally builds operator visibility-promotion or whether the MVP relies only on notes created `client_visible` at write time.
- **Scope-pinning is the security crux** — every client write (job submission, proposal acceptance) must derive `client_id` from the user's `client_users` scope, never from form input; `canActOnClientJob(scope, job.clientId)` is the guard (the `canActOnAssignment` twin).
- **No operator-surface duplication** — the `(app)/clients/*` operator UI is untouched; the `(client)` group is a separate, client-scoped surface.

## §10 Out-of-scope reminders (do-NOT, roadmap §8)
- External portal integrations (Phase 12) · email parser (Phase 13) · snow module · PM module.
- Do not modify `src/server/vendor/*` or `src/app/(vendor)/*` (Phase 10 frozen).
- Do not build operator client-management (already exists in `(app)/clients/*`).
