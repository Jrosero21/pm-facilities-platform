# Phase 20 — DB Changes

## ONE migration (0043) — additive columns only.

`job_attachments` gains three nullable columns; no new tables, no FK changes, no index changes, no drops.
Confirmed sandbox + prod:
- Live table count: **115** (unchanged — additive columns).
- Latest migration: **0043** (`0043_robust_mentor.sql`). Migration ledger at 44 rows.

The second v2 migration (after 0042 in Phase 19).

## The 3 columns

| Table | Column | Type | Null | Default | Purpose |
|---|---|---|---|---|---|
| `job_attachments` | `storage_key` | varchar(1024) | YES | NULL | the object key in the store (`tenant/…/attachment/<id>.<ext>`); the new placeholder marker is `NULL` |
| `job_attachments` | `checksum` | varchar(255) | YES | NULL | sha256 hex of the stored bytes (integrity) |
| `job_attachments` | `storage_provider` | varchar(32) | YES | NULL | which backend stored it (`r2` \| `capture`) |

Generated `0043_robust_mentor.sql` is exactly three `ADD COLUMN` statements — no DROP, no table create,
no index, no FK.

## Pre-existing columns (unchanged)

`file_url` (varchar 1024), `file_size_bytes` (bigint), `file_mime_type` (varchar 127) already existed
(Phase 10) and are **unchanged**. The real-upload path now populates `file_size_bytes`/`file_mime_type`
(and `storage_key`/`checksum`/`storage_provider`); `file_url` stays **NULL** (the image is served via a
presigned URL derived from `storage_key`, not a persisted URL).

## Placeholder marker

`storage_key NULL` is the real-bytes placeholder marker. Existing placeholder rows (Phase 10) remain
valid placeholders — Phase 20 did **not** backfill them (legacy-row backfill was out of scope; a soft
residual of FB-10a.4).

## Migration cadence (followed)

`db:generate` → sandbox apply → `-E` contract-verify (3 columns; table count 115; no FK change) →
prod-confirm gate → prod apply → contract-verify on prod → commit (`e025161`). Each gated; sandbox and
prod both carry the columns; git schema-source matches live.
