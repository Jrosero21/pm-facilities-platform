# Phase 1 — Business Rules

Rules introduced in Phase 1. Inherits the platform-level rules from Phase 0 (`docs/phase-0-foundation/06-business-rules.md`): source-agnostic model, server-side DB access only, auditability over overwrites, AI output is a reviewable draft.

## R-1.1 — Every record will be tenant-scoped
- A user belongs to zero or more tenants via `tenant_users`.
- Functional data (clients, vendors, jobs, …) created in later phases must carry a `tenant_id`. Phase 1 establishes the `tenants` anchor every later table references.

## R-1.2 — super_admin is global and bypasses role checks
- A `super_admin` grant has `tenant_id = NULL` and `roles.scope = global`.
- `requireRole(...)` always allows a super_admin. Use super_admin sparingly — it is a platform operator, not a tenant role.

## R-1.3 — Roles are global definitions; assignment is scoped
- `roles` is a fixed taxonomy (`super_admin`, `tenant_admin`, `operator`, `accounting`, `vendor_user`, `client_user`).
- A grant in `user_roles` ties (user, role, tenant). `tenant_id` is NULL only for global roles.
- A user's effective roles in a request = global grants + grants in the active tenant.

## R-1.4 — Active tenant resolution is deterministic
- Active tenant = a valid `pm_active_tenant` cookie that matches a current membership; otherwise the first membership with status `active`; otherwise none.
- A cookie pointing at a tenant the user no longer belongs to is ignored, never trusted.

## R-1.5 — Protected routes validate the session server-side
- Authorization is decided on the server via the guard, against the live session — not by trusting a cookie's mere presence on the client.
- Feature code must go through `requireAuth` / `requireTenant` / `requireRole`, not call the session API directly.

## R-1.6 — Auth-significant events are audited
- Login and user creation write `audit_logs` rows; tenant switches do too.
- Audit writes are append-only and must never block or fail the user action.

## R-1.7 — Tenants are polymorphic; Phase 1 only creates aggregators
- `tenants.type` ∈ {`aggregator`, `vendor`, `client`}. The column exists from day 1 (harmless placeholder, roadmap §5.4) so vendor/client portals (Phases 10–11) need no schema churn.
- Phase 1 only creates `aggregator` tenants.

## R-1.8 — Tenant and membership lifecycle states exist but are unused
- `tenants.status` ∈ {`active`, `suspended`, `archived`}; `tenant_users.status` ∈ {`active`, `invited`, `suspended`}.
- Phase 1 only uses `active`. The other states are reserved for invitations and suspension flows in later phases.
