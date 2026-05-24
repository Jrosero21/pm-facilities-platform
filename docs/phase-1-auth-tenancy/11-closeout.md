# Phase 1 Closeout — Multi-Tenant Auth, Users, and Roles

## Phase Goal
Build the multi-tenant foundation — authentication, a tenant model, a role model, and a reusable server-side guard — so every future record can be tenant-scoped and every future page can be authorized consistently.

## Completed Deliverables
- Application tooling: pnpm, Next.js 16 (App Router, `src/`), TypeScript strict, ESLint 9, Prettier, Tailwind CSS v4.
- Drizzle ORM + drizzle-kit wired to MySQL/MariaDB; first migration generated and applied.
- 9-table schema: `users`, `sessions`, `accounts`, `verifications`, `tenants`, `tenant_users`, `roles`, `user_roles`, `audit_logs` — all InnoDB / utf8mb4.
- better-auth (email + password) with login, protected app shell, and logout.
- Reusable server guard: `getAuthContext`, `requireAuth`, `requireTenant`, `requireRole`, `setActiveTenant`.
- Cookie-based active-tenant resolution (`pm_active_tenant`) with flat URLs.
- Idempotent seed: 6 roles, first aggregator tenant, first super_admin user, membership + grants.
- Audit logging for `auth.login`, `auth.user.created`, `tenant.switched`.
- All eleven Phase 1 docs.

## Files Created or Changed
- Tooling/config: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.prettierrc`, `.prettierignore`, `.env.example`, `.gitignore`, `drizzle.config.ts`, `scripts/fix-mysql-engine.mjs`.
- Schema: `src/server/schema/{auth,tenants,roles,audit-logs,index}.ts`.
- Migration: `db/migrations/0000_swift_cloak.sql` (+ `meta/`).
- Seed: `db/seeds/initial.ts`.
- Server: `src/server/{db,auth,auth-context,audit}.ts`.
- Client/UI: `src/lib/auth-client.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/api/auth/[...all]/route.ts`, `src/app/forbidden/page.tsx`, `src/app/no-tenant/page.tsx`, `src/components/sign-out-button.tsx`.
- Removed: root roadmap PDF; old `src/app/dashboard/page.tsx` (moved under `(app)`).
- Docs: `docs/phase-1-auth-tenancy/01..11`.

## Database Changes
See `08-db-changes.md`. 9 InnoDB/utf8mb4 tables, 10 FKs, indexed joins, polymorphic `tenants.type`. DB charset converted to utf8mb4; engine forced to InnoDB via the migration post-processor. Seeded 6 roles + 1 tenant + 1 super_admin.

## API Routes / Server Actions Added
See `09-api-routes.md`. `/api/auth/[...all]` handler; pages `/`, `/login`, `/dashboard`, `/forbidden`, `/no-tenant`; server guard functions in `src/server/auth-context.ts`.

## User-Facing Workflows Added
Sign in, view dashboard context, sign out (see `03-user-sop.md`, `05-system-workflows.md`).

## Admin/Internal Workflows Added
Env setup, migrations (`db:generate`/`db:migrate`), seeding (`db:seed`), running/verifying the app, interim user creation (see `04-admin-sop.md`).

## Business Rules Added
See `06-business-rules.md`: tenant-scoping (R-1.1), global super_admin bypass (R-1.2), scoped role grants (R-1.3), deterministic active tenant (R-1.4), server-side authorization (R-1.5), audited auth events (R-1.6), polymorphic tenants (R-1.7), reserved lifecycle states (R-1.8).

## Chatbot Knowledge Added
See `07-chatbot-knowledge.md`: identity/access model, tenants, roles, how protection works, audit trail, and an explicit list of what does not exist yet.

## Verification Performed
```bash
git branch --show-current          # phase-1-auth-tenancy
ls docs/phase-1-auth-tenancy/      # 01..11 present
pnpm build                         # compiles; TS strict passes; 7 routes
pnpm lint                          # clean

# DB: 9 app tables, all InnoDB/utf8mb4, 10 FKs
mysql ... -e "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='jonnyrosero_pm';"

# Auth: unauth /dashboard -> 307 /login
curl -sI -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/dashboard

# Login verified in-browser (dashboard renders user/tenant/roles); sign-out returns to /login.
# Audit: a real sign-in wrote an auth.login row with user_id, ip, user_agent.
```

## Known Limitations
See `10-known-limitations.md`. Highlights: no invitation flow / public signup (L-1.1); logout & failed logins unaudited (L-1.2); no email verification (L-1.3); no password reset (L-1.4); no tenant-switcher UI (L-1.5); better-auth IDs not UUID v7 (L-1.6); MySQL engine must be forced per migration (L-1.7); no route middleware (L-1.8); no auth rate limiting (L-1.9); no CI (L-1.10).

## Carry-Forward Items
- Invitation flow (token + accept page; uses `tenant_users.status = invited`).
- Logout + failed-login auditing.
- Email verification + password reset (needs an email provider).
- Tenant-switcher UI calling `setActiveTenant`.
- Auth rate limiting before any public exposure.
- CI (build/lint/typecheck) — carried from Phase 0.

## Recommended Next Phase Focus
Phase 2 — Clients and client locations (`v0.3.0-phase-2`). Tables: `clients`, `client_contacts`, `client_locations`, `client_location_contacts`, `client_location_hours`, `client_location_access_notes`, `client_billing_rules`. Every table carries `tenant_id`; every screen lives under the `(app)` group and opens with `requireTenant()`, scoping all queries by `ctx.activeTenant.tenantId`. Follow the InnoDB/utf8mb4 migration convention and start writing history/event rows where the data is operational.
