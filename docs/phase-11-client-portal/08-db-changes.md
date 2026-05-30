# Phase 11 — Database Changes

One migration this phase. No enum changes, no column additions to existing tables.

## Migration 0027 — `client_users`

`db/migrations/0027_cloudy_squirrel_girl.sql` — `CREATE TABLE client_users`. The lean twin of `vendor_users`.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(36) PK | uuidv7 default |
| `tenant_id` | varchar(36) NOT NULL | FK → `tenants.id` ON DELETE CASCADE |
| `user_id` | varchar(36) NOT NULL | FK → `users.id` ON DELETE CASCADE |
| `client_id` | varchar(36) NOT NULL | FK → `clients.id` ON DELETE CASCADE |
| `created_at` | timestamp NOT NULL | defaultNow |
| `updated_at` | timestamp NOT NULL | defaultNow / onUpdateNow |

Indexes: unique `client_users_tenant_user_client_unique (tenant_id, user_id, client_id)`; index `client_users_tenant_client_idx (tenant_id, client_id)` (backs operator-side "who can access this client").

**No `status` column** — matches the actual `vendor_users` shape (11c empirical finding; overrides 11b prose).

Source: `src/server/schema/clients.ts` (`clientUsers` export).

## Applied

- **Sandbox:** applied + contract-verified (byte-for-byte twin of `vendor_users`).
- **Production:** applied on explicit confirm; journal entry recorded; prod migration count 28. Commit unit was 4 files (schema source + `.sql` + `_journal.json` + `<n>_snapshot.json`) — the ratified standing migration commit shape.

## Things that needed NO migration

- **`origin='client'`** on `job_notes` — the column is `varchar(16)` (not an enum); it accepts the new value as-is. Only the TypeScript `CreateJobNoteInput.origin` union was widened (`+'client'`), exactly the schema lock's documented intent.
- **`source_type='internal_client_portal'`** on `jobs` — already a valid enum value (Phase-4 forward-declared); the submission path simply pins it.

## No other schema change

No new tables beyond `client_users`; no altered columns; no new enums. All Phase-11 reads/writes compose over existing Phase 4 / 8 / 10 schema.
