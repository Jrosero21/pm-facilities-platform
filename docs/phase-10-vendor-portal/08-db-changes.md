# Phase 10 — Vendor Portal MVP · Database Changes

Two migrations: `0025` (a new table — the load-bearing identity linkage) and `0026` (a column on a populated table — the first such Phase-10 migration). Both followed the standing cadence: drizzle entry → `db:generate` → SQL inspection (halt gate) → sandbox apply → contract-verify → prod apply → contract-verify → commit.

## Migration `0025` — `vendor_users` (10d/10e · `c448bcd`)

```sql
CREATE TABLE `vendor_users` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `vendor_id` varchar(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_users_id` PRIMARY KEY(`id`),
  CONSTRAINT `vendor_users_tenant_user_vendor_unique` UNIQUE(`tenant_id`,`user_id`,`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE `vendor_users` ADD CONSTRAINT … FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE cascade;
ALTER TABLE `vendor_users` ADD CONSTRAINT … FOREIGN KEY (`user_id`)   REFERENCES `users`(`id`)   ON DELETE cascade;
ALTER TABLE `vendor_users` ADD CONSTRAINT … FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`)  ON DELETE cascade;
CREATE INDEX `vendor_users_tenant_vendor_idx` ON `vendor_users` (`tenant_id`,`vendor_id`);
```

- **Column types** match the parent ids byte-for-byte: `varchar(36)` / utf8mb4 / utf8mb4_unicode_ci (locked empirically at 10c).
- **Indexes (5):** `PRIMARY(id)`, `vendor_users_tenant_user_vendor_unique` (unique), `vendor_users_tenant_vendor_idx` (operator "who staffs this vendor" reads), + **2 auto FK-backing** indexes MariaDB adds on `user_id` and `vendor_id` (standard InnoDB; `tenant_id` is covered by the leftmost prefix of the unique/secondary indexes).
- **All FKs cascade** — the mapping is meaningless without its tenant, user, and vendor (mirrors `tenant_users`' all-cascade precedent).
- **Verified:** byte-for-byte sandbox ⇄ prod parity (matching `__drizzle_migrations` hash `ae94741…` + `when` 1780111396644). 0 rows at apply.

## Migration `0026` — `job_notes.origin` (10l-migration · `91ee94c`)

```sql
ALTER TABLE `job_notes` ADD `origin` varchar(16) DEFAULT 'operator' NOT NULL;
```

- **First Phase-10 migration touching a populated prod table** (`job_notes` had 3 rows).
- `varchar(16)` (not an enum) by lock — values `operator`/`vendor` are app-enforced; future origins (`client`, `system`) grow without a migration.
- **DoR-10b.2 verified empirically post-prod-apply:** `total=3, origin='operator'=3, NULL=0, ''=0`. The 3 pre-existing operator-authored notes backfilled correctly; no backfill script needed.
- Verified sandbox ⇄ prod column parity (`varchar(16)` / NO / `'operator'` / utf8mb4_unicode_ci), matching journal hash `1c39899…` + `when` 1780142602241.

## Schema files modified

- `src/server/schema/vendors.ts` — `+vendorUsers` table export (with provenance comment).
- `src/server/schema/job-details.ts` — `+origin` column on `jobNotes` (between `visibility` and `status`).

## Migration count at close

Prod `__drizzle_migrations` = **27** (`0000`–`0026`). No tables dropped, no columns removed, no data conversions. Both migrations are additive and reversible-by-drop.
