# Phase 1 — Chatbot Knowledge

The operations chatbot ships in Phase 16 but is built from these closeout docs. This file is the **source of truth** for how authentication, tenancy, and roles work after Phase 1. It is written to stand alone: an LLM given only this file should be able to answer operational questions correctly. It cross-references `02-decisions.md` (why), `06-business-rules.md` (rules), and `08-db-changes.md` (full schema), but does not depend on them.

## K-1.1 — Auth model at a glance
- Authentication is handled by **better-auth** using **email + password only** (no OAuth in Phase 1). `autoSignIn` is on, so signing up immediately creates a session.
- Access is **invite-only**: there is no public signup page. The first user and tenant are created by a seed script (`db/seeds/initial.ts`).
- Sessions are cookie-based. better-auth sets its own session cookie on login; a separate `pm_active_tenant` cookie tracks which tenant the user is acting in.
- All authorization happens **server-side** against the live session — the client cannot self-authorize.

## K-1.2 — Auth tables and their key columns (Q2)
better-auth owns four tables (logical names mapped to plural table names in `src/server/auth.ts`):
- **`users`** — `id` (PK, varchar 36), `name`, `email` (unique), `email_verified` (boolean, default false and stays false — no verification flow yet), `image`, `created_at`, `updated_at`. This is the identity record. It holds **no password**.
- **`accounts`** — `id` (PK), `account_id`, `provider_id`, `user_id` → `users` (cascade delete), OAuth token columns (unused in Phase 1), and **`password`** (text). **The hashed password lives in `accounts.password`**, not in `users`. For an email/password user there is one `accounts` row with `provider_id = "credential"`.
- **`sessions`** — `id` (PK), `token` (unique), `expires_at`, `ip_address`, `user_agent`, `user_id` → `users` (cascade). One row per active login session.
- **`verifications`** — `id` (PK), `identifier`, `value`, `expires_at`. Scaffold for email-verification / reset tokens; unused in Phase 1.

IDs: better-auth generates its own 32-char IDs for these four tables (e.g. `ieq5Za0aXyJVVNYBUowyBkVWtyLUaRbB`). The tenancy/RBAC tables below use app-generated UUID v7. Both fit `varchar(36)`.

## K-1.3 — Tenant model
- **`tenants`** — `id` (UUID v7), `name`, `slug` (unique), `type` ∈ {`aggregator`,`vendor`,`client`} (default `aggregator`), `status` ∈ {`active`,`suspended`,`archived`} (default `active`). Phase 1 only creates `aggregator` tenants; `type` exists from day 1 so vendor/client portals (Phases 10–11) need no schema change.
- **`tenant_users`** — membership join: `id`, `tenant_id` → `tenants` (cascade), `user_id` → `users` (cascade), `status` ∈ {`active`,`invited`,`suspended`} (default `active`). Unique on (`tenant_id`,`user_id`). A user can belong to many tenants; only `active` is used in Phase 1.

## K-1.4 — Role model and taxonomy
- **`roles`** — fixed taxonomy: `id`, `key` (unique), `label`, `scope` ∈ {`global`,`tenant`}, `description`. The six seeded roles:
  - `super_admin` — **scope `global`** — platform-level admin, acts across all tenants.
  - `tenant_admin` — scope `tenant` — administers one tenant (members, roles, settings).
  - `operator` — scope `tenant` — jobs, dispatch, day-to-day ops.
  - `accounting` — scope `tenant` — invoices, billing, financial reporting.
  - `vendor_user` — scope `tenant` — external vendor portal user (full use in Phase 10).
  - `client_user` — scope `tenant` — external client portal user (full use in Phase 11).
- **`user_roles`** — grant join: `id`, `user_id` → `users` (cascade), `role_id` → `roles` (restrict), **`tenant_id` → `tenants` (cascade, NULLABLE)**, `granted_at`, `granted_by_user_id`. Unique on (`user_id`,`role_id`,`tenant_id`). A grant ties a user to a role **in a specific tenant**; `tenant_id` is `NULL` only for global grants.

## K-1.5 — How a platform-wide admin is represented (Q1)
A platform-wide admin is a user holding the `super_admin` role **globally**. Concretely, there is a row in `user_roles` where:
- `role_id` points at the `roles` row whose `key = 'super_admin'` (that role has `scope = 'global'`), **and**
- `tenant_id = NULL`.

The `NULL` tenant_id is what makes the grant global rather than scoped to one tenant. At request time the guard computes `isSuperAdmin = (a user_roles row exists with key 'super_admin' AND tenant_id IS NULL)`. A super_admin **bypasses all role checks** (`requireRole(...)` returns success immediately). Note: a `super_admin` grant scoped to a specific tenant (non-null `tenant_id`) would NOT set the global `isSuperAdmin` flag — global admin requires `tenant_id = NULL`.

## K-1.6 — How effective permissions are computed (Q3)
On each request the guard (`getAuthContext` in `src/server/auth-context.ts`) does:
1. Load all `user_roles` rows for the user, joined to `roles` to get each `key` and the grant's `tenant_id`.
2. Resolve the **active tenant** (see K-1.7).
3. **Effective role keys = the union of:** (a) every grant with `tenant_id IS NULL` (global grants), and (b) every grant whose `tenant_id` equals the active tenant's id. Grants scoped to *other* tenants are excluded.
4. `isSuperAdmin` = any grant with key `super_admin` and `tenant_id IS NULL`.

Authorization helpers then apply:
- `requireRole(...allowed)` → allow if `isSuperAdmin`, else allow if any effective role key ∈ `allowed`, else redirect to `/forbidden`.

**Edge cases:**
- **super_admin with no tenant membership:** `isSuperAdmin` is still true (a global grant needs no membership). `requireAuth()` and `requireRole('super_admin')` pass. But `requireTenant()` redirects to `/no-tenant`, because there is no active tenant — so a membership-less super_admin can reach role-gated-but-tenant-optional pages, not tenant-scoped ones.
- **user with membership but no roles in the active tenant:** effective role keys contain only their global grants (possibly none); `requireRole(...)` for a tenant role sends them to `/forbidden`.
- **grant scoped to a non-active tenant:** ignored until that tenant becomes the active tenant.

## K-1.7 — How tenant resolution works per request (Q5)
The active tenant is resolved server-side, and the cookie is a **hint, not a trusted source**:
1. Read the `pm_active_tenant` cookie (httpOnly, sameSite lax, secure in prod, path `/`).
2. Load the user's memberships from `tenant_users` (joined to `tenants`).
3. If the cookie value matches a tenant the user is **currently a member of**, that is the active tenant.
4. Otherwise fall back to the user's **first membership with status `active`**.
5. Otherwise there is no active tenant (→ `requireTenant()` redirects to `/no-tenant`).

A cookie pointing at a tenant the user no longer belongs to (or never did) is ignored — membership is always re-validated against the DB. Switching tenants goes through `setActiveTenant(tenantId)`, which verifies that the user is an active member of the target tenant before it writes the `pm_active_tenant` cookie and records a `tenant.switched` audit row. No UI control calls `setActiveTenant` yet, but the server-side mechanism exists and is the only sanctioned way to change the active tenant.

## K-1.8 — The server guard surface
All feature code authorizes through `src/server/auth-context.ts` rather than calling better-auth directly:
- `getAuthContext()` → `{ user, sessionId, memberships[], activeTenant, roleKeys[], isSuperAdmin }` or `null`.
- `requireAuth()` → the context, or redirect `/login` if no session.
- `requireTenant()` → `requireAuth` plus a guaranteed non-null `activeTenant`, else redirect `/no-tenant`.
- `requireRole(...keys)` → role gate per K-1.6, else redirect `/forbidden`.
- `setActiveTenant(id)` → validated cookie switch + `tenant.switched` audit.

Protected pages live under the `(app)` route group, whose layout calls `requireAuth()`. `/dashboard` additionally calls `requireTenant()`.

## K-1.9 — Login, logout, and audit at runtime
- **Login:** POST `/api/auth/sign-in/email` → better-auth verifies the password against `accounts.password` → inserts a `sessions` row + sets the session cookie → a `databaseHooks.session.create.after` hook writes an `auth.login` audit row (capturing `ip_address`, `user_agent`).
- **Signup (seed/admin only):** creates the `users` + `accounts` rows; `databaseHooks.user.create.after` writes `auth.user.created`.
- **Logout:** client calls `authClient.signOut()` → session deleted + cookie cleared → redirect `/login`. (Logout is **not** audited yet.)
- **Audit table:** `audit_logs` (`tenant_id`, `user_id`, `actor_label`, `action`, `target_type`, `target_id`, `metadata` JSON, `ip_address`, `user_agent`, `created_at`). Append-only; writes never block or fail the user action. Events emitted in Phase 1: `auth.login`, `auth.user.created`, `tenant.switched`. (Failed logins are not yet audited.)

## K-1.10 — Seeded state (Q4)
`pnpm db:seed` (idempotent) creates exactly:
- **6 roles** — the taxonomy in K-1.4.
- **1 tenant** — name "Demo Aggregator", slug `demo`, type `aggregator`, status `active`.
- **1 user** — `jnrosero@gmail.com` (name "Jonathan Rosero"), password from `SEED_ADMIN_PASSWORD`. `email_verified` is false.
- **1 membership** — a `tenant_users` row linking that user to the Demo Aggregator tenant, status `active`.
- **2 role grants** in `user_roles` for that user:
  - `super_admin` with `tenant_id = NULL` (global → platform admin), and
  - `tenant_admin` with `tenant_id =` the Demo Aggregator tenant id (scoped).

So the seeded user is simultaneously a global platform admin and the tenant_admin of Demo Aggregator. Defaults are overridable via `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_TENANT_NAME`, `SEED_TENANT_SLUG`.

## K-1.11 — Worked example: GET /dashboard as the seeded user
A logged-in request from `jnrosero@gmail.com` to `/dashboard`:
1. `(app)/layout.tsx` calls `requireAuth()` → `getAuthContext()`.
2. better-auth reads the session cookie, validates it against `sessions`, returns the user (`jnrosero@gmail.com`).
3. Memberships loaded from `tenant_users ⨝ tenants` → `[Demo Aggregator (active)]`.
4. Role grants loaded from `user_roles ⨝ roles` → `[{key: super_admin, tenant_id: NULL}, {key: tenant_admin, tenant_id: <demo-id>}]`. `isSuperAdmin = true`.
5. Active tenant: the `pm_active_tenant` cookie is read. If it equals `<demo-id>` (a real membership) → Demo Aggregator. If absent/invalid → fall back to the first active membership → Demo Aggregator.
6. Effective role keys = global `super_admin` ∪ active-tenant `tenant_admin` = `["super_admin", "tenant_admin"]`.
7. `dashboard/page.tsx` calls `requireTenant()`; the active tenant is non-null, so it renders.
8. The page shows: user `jnrosero@gmail.com (Jonathan Rosero)`, active tenant `Demo Aggregator (aggregator)`, roles `super_admin, tenant_admin`, memberships `1`.

If that user's session cookie were cleared, step 2 returns null and `requireAuth()` redirects to `/login` (HTTP 307).

## K-1.12 — What does NOT exist yet (do not claim these)
No invitation flow / public signup, no email verification, no password reset, no profile/password editing, no tenant-switcher UI, no OAuth, no route-level middleware, no auth rate limiting, no CI. Logout and failed logins are not audited. `email_verified` is always false. Global-role uniqueness (e.g. preventing two global `super_admin` grants for one user) is **not** DB-enforced, because MySQL unique indexes treat `NULL` tenant_id values as distinct — it is only guarded in app/seed code.
