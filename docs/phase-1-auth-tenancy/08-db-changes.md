# Phase 1 — Database Changes

## Summary
First schema for the platform. Migration `db/migrations/0000_swift_cloak.sql` creates 9 application tables (plus drizzle-kit's `__drizzle_migrations` tracking table). All tables are **InnoDB / utf8mb4 / utf8mb4_unicode_ci**.

Preconditions done once before the migration:
- `ALTER DATABASE jonnyrosero_pm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
- Engine forced to InnoDB via `scripts/fix-mysql-engine.mjs` (Namecheap MariaDB defaults to MyISAM, which silently drops FKs).

## Tables

### Auth (better-auth-managed shape)
- **users** — `id` (PK), `name`, `email` (unique), `email_verified`, `image`, `created_at`, `updated_at`.
- **sessions** — `id` (PK), `expires_at`, `token` (unique), `ip_address`, `user_agent`, `user_id` → users (cascade), `created_at`, `updated_at`.
- **accounts** — `id` (PK), `account_id`, `provider_id`, `user_id` → users (cascade), OAuth token columns, `password` (hashed, for email/password), `created_at`, `updated_at`.
- **verifications** — `id` (PK), `identifier`, `value`, `expires_at`, `created_at`, `updated_at`.

### Tenancy
- **tenants** — `id` (PK), `name`, `slug` (unique), `type` enum(`aggregator`,`vendor`,`client`) default `aggregator`, `status` enum(`active`,`suspended`,`archived`) default `active`, `created_at`, `updated_at`.
- **tenant_users** — `id` (PK), `tenant_id` → tenants (cascade), `user_id` → users (cascade), `status` enum(`active`,`invited`,`suspended`) default `active`, `joined_at`, `updated_at`. Unique(`tenant_id`,`user_id`); indexes on `user_id` and `tenant_id`.

### RBAC
- **roles** — `id` (PK), `key` (unique), `label`, `scope` enum(`global`,`tenant`), `description`, `created_at`, `updated_at`.
- **user_roles** — `id` (PK), `user_id` → users (cascade), `role_id` → roles (restrict), `tenant_id` → tenants (cascade, **nullable** for global roles), `granted_at`, `granted_by_user_id` → users (set null). Unique(`user_id`,`role_id`,`tenant_id`); indexes on `user_id` and `tenant_id`.

### Audit
- **audit_logs** — `id` (PK), `tenant_id` → tenants (set null), `user_id` → users (set null), `actor_label`, `action`, `target_type`, `target_id`, `metadata` (json), `ip_address`, `user_agent`, `created_at`. Indexes on `tenant_id`, `user_id`, `action`, `created_at`.

## Foreign keys (10 total)
- accounts.user_id → users (cascade)
- sessions.user_id → users (cascade)
- tenant_users.tenant_id → tenants (cascade), tenant_users.user_id → users (cascade)
- user_roles.user_id → users (cascade), .role_id → roles (restrict), .tenant_id → tenants (cascade), .granted_by_user_id → users (set null)
- audit_logs.tenant_id → tenants (set null), audit_logs.user_id → users (set null)

## Keys / IDs
- PKs are `varchar(36)`. Tenants/roles/tenant_users/user_roles/audit_logs use app-generated **UUID v7**. better-auth rows (users/sessions/accounts/verifications) use better-auth's own 32-char ID format. Both fit `varchar(36)`.

## Seed data (`db/seeds/initial.ts`, idempotent)
- 6 roles: `super_admin` (global) + `tenant_admin`, `operator`, `accounting`, `vendor_user`, `client_user` (tenant).
- 1 aggregator tenant — default name "Demo Aggregator", slug `demo`.
- 1 super_admin user — default `jnrosero@gmail.com` (password from `SEED_ADMIN_PASSWORD`).
- Membership row + grants: `super_admin` (global) and `tenant_admin` (in the seeded tenant).

## Verification
```bash
mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm -e \
  "SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
   WHERE TABLE_SCHEMA='jonnyrosero_pm' ORDER BY TABLE_NAME;"
```
Expect 9 app tables (+ `__drizzle_migrations`), all `InnoDB` / `utf8mb4_unicode_ci`.

## Forward pointers
- Phase 2 (`clients`, `client_locations`, …) tables must include `tenant_id` and follow the InnoDB/utf8mb4 + history-table conventions.
