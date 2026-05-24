# Phase 1 — Phase Summary

## Phase Name
Multi-Tenant Auth, Users, and Roles

## Version
`v0.2.0-phase-1`

## Phase Goal
Stand up the multi-tenant foundation so every future record can be tenant-scoped: authentication, a tenant model, a role model, and a reusable server-side guard that resolves "who is acting, in which tenant, with which roles" on every request.

## In Scope
- Application tooling: pnpm, Next.js 16 (App Router, `src/`), TypeScript strict, ESLint, Prettier, Tailwind CSS v4.
- Drizzle ORM + drizzle-kit against MySQL/MariaDB; first migration applied.
- Schema: `users`, `sessions`, `accounts`, `verifications` (auth), `tenants`, `tenant_users` (tenancy), `roles`, `user_roles` (RBAC), `audit_logs`.
- Authentication via better-auth (email + password).
- Login page, protected app shell, logout.
- Tenant-aware server-side guard: `getAuthContext`, `requireAuth`, `requireTenant`, `requireRole`, `setActiveTenant`.
- Initial role taxonomy seeded; first aggregator tenant and first super_admin user seeded.
- Audit logging for auth events (login, user creation) and tenant switch.

## Out of Scope (deferred to later phases)
- Clients and client locations (Phase 2).
- Vendors (Phase 3).
- Jobs, dispatch, communications, AI scope, billing (Phases 4–8).
- Vendor portal, client portal, integrations, email ingestion, PM, snow, chatbot (Phases 9–16).
- Public self-serve signup, invitations UI, email verification, password reset, OAuth providers, tenant-switcher UI, route-level middleware, CI.

## Status
Complete. Branch `phase-1-auth-tenancy`, tag `v0.2.0-phase-1`.

## Pointers
- Decisions: `02-decisions.md`
- DB changes: `08-db-changes.md`
- Guard pattern & routes: `09-api-routes.md`
- Known limitations: `10-known-limitations.md`
- Closeout: `11-closeout.md`
