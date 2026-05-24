# Phase 1 — Chatbot Knowledge

Facts the future operations chatbot (Phase 16) should know about auth and tenancy. Written as durable statements about how the system behaves.

## Identity & access
- Authentication is handled by **better-auth** with **email + password**. There is no OAuth and no public signup in Phase 1.
- A **user** is a person with one global login (one email). Users are stored in `users`; credentials (hashed password) live in `accounts`; active sessions live in `sessions`.
- Access is **invite-only**. The first user (a super_admin) and the first tenant are created by a seed script. There is no self-serve registration.

## Tenants
- A **tenant** is an organization on the platform. Tenants have a **type**: `aggregator` (the facilities-management company), `vendor`, or `client`. Phase 1 only creates aggregator tenants.
- A user can belong to **multiple tenants** through `tenant_users`. The tenant a user is currently acting in is the **active tenant**, stored in the `pm_active_tenant` cookie, defaulting to the user's only/first membership.

## Roles
- Six roles exist: `super_admin` (global), and `tenant_admin`, `operator`, `accounting`, `vendor_user`, `client_user` (tenant-scoped).
- `super_admin` acts across all tenants and bypasses role checks. The other roles only mean something inside a specific tenant.
- A user's permissions in a request = their global grants + their grants in the active tenant.

## How protection works
- Pages and server actions are guarded server-side. `requireAuth` demands a logged-in user, `requireTenant` additionally demands an active tenant, and `requireRole(...)` demands a specific role (super_admin always passes).
- An unauthenticated request to a protected page redirects to `/login`. A role failure redirects to `/forbidden`. A user with no tenant lands on `/no-tenant`.

## Audit trail
- The system records auth-significant events in `audit_logs`: `auth.login`, `auth.user.created`, and `tenant.switched`. Each row can carry the tenant, user, action, target, free-form metadata, IP address, and user agent.
- Audit logging is append-only and best-effort: it never blocks or fails the user's action.

## What does NOT exist yet (so the bot should not claim it)
- No invitation flow, password reset, email verification, profile editing, OAuth, tenant-switcher UI, route-level middleware, rate limiting, or CI. Logout and failed logins are not yet audited.
