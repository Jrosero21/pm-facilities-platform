# Phase 1 — Decisions

Architectural and process decisions locked in during Phase 1. Future phases inherit these unless explicitly overridden. Builds on the Phase 0 decisions (`docs/phase-0-foundation/02-decisions.md`).

## D-1.1 — Stack: pnpm + Next.js 16 + Drizzle + Tailwind v4
- **Why:** Modern, type-safe, server-first. Matches tooling already shipped elsewhere (cielo141). Next.js App Router gives server components for free, which suits the "server-side DB access only" rule.
- **How to apply:** Package manager is pnpm (`packageManager` pinned in `package.json`). App code under `src/`. All DB access stays server-side.

## D-1.2 — better-auth for auth primitives only; tenancy is custom
- **Why:** better-auth cleanly owns users, sessions, accounts, verifications, password hashing, and the email/password flow. Keeping tenancy custom (`tenants`, `tenant_users`, `roles`, `user_roles`) avoids coupling our domain model to the plugin's owner/admin/member role shape and lets tenants be polymorphic (aggregator/vendor/client).
- **How to apply:** Auth lifecycle goes through better-auth. Multi-tenancy and RBAC are our own tables and our own guard (`src/server/auth-context.ts`). Do not adopt better-auth's organization plugin without revisiting this.

## D-1.3 — UUID v7 primary keys (varchar(36)), app-generated
- **Why:** Globally unique, time-sortable, portable across MySQL/Postgres, not enumerable. Set as the default for all tables we own.
- **How to apply:** Drizzle `$defaultFn(() => uuidv7())` on `id`. NOTE: better-auth generates its own IDs for `users`/`sessions`/`accounts`/`verifications` (a 32-char URL-safe format), so those rows are not UUID v7. Both fit `varchar(36)`. See `10-known-limitations.md` L-1.6.

## D-1.4 — InnoDB + utf8mb4 enforced on every table
- **Why:** Namecheap MariaDB defaults to MyISAM, which silently drops foreign keys, and the DB shipped as latin1. We need FKs and full Unicode.
- **How to apply:** `ALTER DATABASE ... utf8mb4 / utf8mb4_unicode_ci` done once. `scripts/fix-mysql-engine.mjs` post-processes every generated migration to add `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`; it runs automatically as part of `pnpm db:generate`. Never apply a migration that hasn't been through this step.

## D-1.5 — Cookie-based active tenant + flat URLs
- **Why:** Internal aggregator users belong to one FM company; flat URLs (`/dashboard`, `/jobs`) are simpler than path- or subdomain-based tenancy. Switching is rare.
- **How to apply:** Active tenant is the `pm_active_tenant` cookie, falling back to the user's sole/first active membership. The guard resolves it centrally; route code never parses a tenant from the URL. A path/subdomain scheme can be layered later if cross-tenant work becomes common.

## D-1.6 — Invite-only; first user via seed
- **Why:** Enterprise-shaped. No public signup surface to harden in Phase 1.
- **How to apply:** No signup page. `db/seeds/initial.ts` creates the first aggregator tenant and the first super_admin. Additional users come from a future invitation flow (not built yet — see `10-known-limitations.md` L-1.1).

## D-1.7 — Email + password only (no OAuth in Phase 1)
- **Why:** No provider apps or secrets to manage for an internal tool. OAuth fits later when vendor/client portals open.
- **How to apply:** `emailAndPassword.enabled = true` with `autoSignIn`. Adding a provider is a config change in `src/server/auth.ts` plus env vars.

## D-1.8 — Server-side guard pattern is the reuse surface
- **Why:** Every later phase needs the same "authenticated + tenant-scoped + role-checked" context. Centralizing it prevents ad-hoc checks drifting apart.
- **How to apply:** Server components and actions call `requireAuth()`, `requireTenant()`, or `requireRole(...)` from `src/server/auth-context.ts`. They return a typed `AuthContext`. Do not call `auth.api.getSession` directly in feature code — go through the guard.

## D-1.9 — super_admin is global; other roles are tenant-scoped
- **Why:** Platform operators act across tenants; functional roles are meaningful only within a tenant.
- **How to apply:** `roles.scope` is `global` or `tenant`. In `user_roles`, a global grant has `tenant_id = NULL`. `requireRole` lets super_admin bypass all role checks. Effective roles = global grants + grants in the active tenant.

## D-1.10 — Plural snake_case tables; better-auth mapped onto them
- **Why:** SQL convention; consistency across the schema.
- **How to apply:** Tables are plural (`users`, `sessions`, …). better-auth's singular logical names are mapped to our plural Drizzle tables in `src/server/auth.ts` (`{ user: users, session: sessions, … }`). Drizzle's camelCase field → snake_case column mapping covers the rest.
