# CF-20.1 — Database Changes

**None.** This sub-feature is reader-only over the existing `job_attachments` table. No migration was added (ledger ends at `0053_ambitious_wither.sql`; no new `db/migrations` file).

## Columns read (all pre-existing)
- `id`, `tenant_id`, `job_id`
- `attachment_type` (filtered to `'photo'`)
- `title`, `file_mime_type`, `file_size_bytes`
- `storage_key` (NULL ⇒ title-only placeholder ⇒ `hasFile: false` / `placeholder`)
- `checksum`, `storage_provider` (present on the row; not surfaced by the reader)
- `status` (filtered to exclude `'archived'`)
- `created_at` (ordering)
- author: `uploaded_by_user_id` OR `source_token_id` (write-path provenance; not read here)

The `storage_key` / `checksum` / `storage_provider` columns landed in Phase 20 (migration 0043). `attachment_type='photo'` predates that. Index `(tenant_id, job_id)` already covers the reader's access pattern — no index change needed.
