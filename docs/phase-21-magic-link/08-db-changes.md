# Phase 21 — DB Changes

## ONE migration (0044) — one new table + two additive columns.

`magic_link_tokens` is created; `job_notes` and `job_attachments` each gain one nullable
`source_token_id` column (FK → `magic_link_tokens`). No drops, no changes to existing columns. Confirmed
sandbox + prod:
- Live table count: **116** (was 115 — one new table).
- Latest migration: **0044** (`0044_premium_fabian_cortez.sql`). Migration ledger at **45** rows.

The **third v2 migration** (after 0042 in Phase 19 and 0043 in Phase 20).

## New table — `magic_link_tokens`

| Column | Type | Null | Default | Purpose |
|---|---|---|---|---|
| `id` | varchar(36) | NO | uuidv7 | PK |
| `tenant_id` | varchar(36) | NO | — | owning tenant |
| `assignment_id` | varchar(36) | NO | — | the **one** `job_vendor_assignments` row the token reaches |
| `token_hash` | varchar(64) | NO | — | **`sha256(rawToken)` hex** — the raw token is **never** stored; **UNIQUE** |
| `expires_at` | datetime | NO | — | expiry instant (default mint = +7 days) |
| `revoked_at` | datetime | YES | NULL | set on revoke; non-NULL ⇒ invalid |
| `sent_at` | datetime | YES | NULL | link-delivery idempotency home; set once on a successful send |
| `created_by_user_id` | varchar(36) | YES | NULL | the operator who minted it (FK set null) |
| `created_at` | timestamp | NO | now | — |
| `updated_at` | timestamp | NO | now / on-update | — |

**Foreign keys (pre-named, WP-12.2):**
- `mlt_tenant_fk` → `tenants.id` **ON DELETE CASCADE**
- `mlt_assignment_fk` → `job_vendor_assignments.id` **ON DELETE CASCADE**
- `mlt_created_by_fk` → `users.id` **ON DELETE SET NULL**

**Indexes:** `mlt_token_hash_unique` UNIQUE(`token_hash`) — the lookup key on resolve;
`mlt_tenant_assignment_idx`(`tenant_id`, `assignment_id`) — the operator token-list read.

> The table was placed in a **new** schema file (`src/server/schema/magic-links.ts`) to satisfy
> drizzle's forward-FK ordering (a referenced table must be declared before its referrers); the barrel
> export was added after `dispatch-assignments`.

## Two additive columns — `source_token_id`

| Table | Column | Type | Null | Default | Purpose |
|---|---|---|---|---|---|
| `job_notes` | `source_token_id` | varchar(36) | YES | NULL | the magic-link token a linkless note came through; **NULL = registered write** |
| `job_attachments` | `source_token_id` | varchar(36) | YES | NULL | same, for linkless photo uploads; **NULL = registered write** |

Both `references(() => magicLinkTokens.id, { onDelete: "set null" })`. They are the **read-isolation
provenance** — the token-side readers gate on `source_token_id === resolvedTokenId` so a token sees only
its own rows on a shared job (a registered write, with NULL `source_token_id`, is never returned to a
link reader). See `02-decisions.md` D-21.3.

## Registered writes are unaffected

A registered (account-based) vendor or operator/client write leaves `source_token_id` **NULL** and a
non-NULL author — exactly as before 0044. The column is purely **additive provenance**; no existing
read or write path changed behavior for registered users (D-21.4: byte-for-byte unchanged).

## Migration cadence (followed)

`db:generate` → sandbox apply (env-override) → `-E` contract-verify (new table + 3 FKs + UNIQUE +
composite index; `source_token_id` on both detail tables, each +1 FK; table count 116; ledger 45) →
**prod-confirm gate** → prod apply → contract-verify on prod → commit (`93bf036`). Each gated; sandbox
and prod both carry the table + columns; git schema-source matches live.
