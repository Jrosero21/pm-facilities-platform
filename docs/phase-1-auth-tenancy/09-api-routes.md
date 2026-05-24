# Phase 1 — API Routes & Server Actions

## Route handlers
- **`/api/auth/[...all]`** (GET, POST) — better-auth's catch-all handler, mounted via `toNextJsHandler(auth.handler)` in `src/app/api/auth/[...all]/route.ts`. Serves all auth endpoints: `sign-in/email`, `sign-up/email`, `sign-out`, `get-session`, etc.

## Pages
- **`/`** — public landing; links to `/login`.
- **`/login`** — client component; email+password form wired to `authClient.signIn.email`. Redirects to `/dashboard` on success.
- **`/dashboard`** — protected (under the `(app)` route group). Server component; calls `requireTenant()` and renders user/tenant/roles/membership context.
- **`/forbidden`** — shown when a role check fails.
- **`/no-tenant`** — shown when an authenticated user has no usable tenant membership.

### Route groups
- **`(app)`** — `src/app/(app)/layout.tsx` calls `requireAuth()` and renders the protected app shell (brand, active-tenant badge, user email, sign-out). Everything under it is authenticated. Adds no URL segment.
- **`(auth)`** — holds `/login`. Adds no URL segment.

## Server guard API (`src/server/auth-context.ts`)
The reusable surface every later phase uses instead of hand-rolled checks:
- **`getAuthContext(): Promise<AuthContext | null>`** — resolves session, memberships, active tenant, effective role keys, `isSuperAdmin`.
- **`requireAuth(): Promise<AuthContext>`** — redirects to `/login` if unauthenticated.
- **`requireTenant(): Promise<TenantAuthContext>`** — `requireAuth` + guarantees a non-null `activeTenant` (else `/no-tenant`).
- **`requireRole(...keys): Promise<AuthContext>`** — role gate; super_admin bypasses; else `/forbidden`.
- **`setActiveTenant(tenantId): Promise<boolean>`** — validates membership, sets the `pm_active_tenant` cookie, audits `tenant.switched`. (No UI caller yet.)

## Other server modules
- **`src/server/auth.ts`** — the better-auth instance (drizzle adapter on MySQL, email+password, audit `databaseHooks`).
- **`src/server/db.ts`** — Drizzle client (mysql2 pool) with the full schema registered.
- **`src/server/audit.ts`** — `writeAuditLog(input)` append-only helper.
- **`src/lib/auth-client.ts`** — client-side `authClient` (`signIn`, `signOut`, `useSession`).

## Conventions reinforced
- All DB access is server-side (Phase 0 D-0.3). Client components reach data only through the auth API or, in later phases, server actions / route handlers.
- Feature code authorizes via the guard functions, not by calling `auth.api.getSession` directly (D-1.8).

## Forward pointers
- Phase 2 screens (`/clients`, `/clients/[id]`, …) live under the `(app)` group and open with `requireTenant()` (or `requireRole(...)`), then scope every query by `ctx.activeTenant.tenantId`.
