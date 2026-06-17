# CF-20.1 — System Workflows

## Read path (operator views job photos)
Operator opens /jobs/[id]

↓

page.tsx loader (server):

listJobPhotos(tenantId, id)

→ SELECT from job_attachments

WHERE tenant_id AND job_id AND attachment_type='photo' AND status != 'archived'

ORDER BY created_at DESC

→ rows with hasFile = (storage_key != null)

↓

for each photo, getJobPhotoUrl({ tenantId, jobId, attachmentId }):

→ SELECT storage_key WHERE id AND tenant_id AND job_id AND attachment_type='photo' AND status!='archived'

→ !row        → forbidden

→ !storage_key → placeholder

→ getSignedUrl(key, 300) !ok → unavailable

→ else        → url (presigned, 300s)

↓

map each result → JobPhotoTile { id, title, sizeBytes, mimeType, url: kind==='url' ? url : null }

↓

<JobPhotosPanel photos={...} />  (pure renderer)

→ url present → <img> thumbnail, links to full-size presigned URL

→ url null    → muted "Unavailable" tile (honest degrade)

## Write path (context — shipped in Phase 20, unchanged here)
Vendor uploads photo (registered vendor OR linkless magic-link)

↓

storage.put(bytes) FIRST  (failed put → no DB row)

↓

INSERT job_attachments { attachment_type:'photo', storage_key, checksum, storage_provider,

file_mime_type, file_size_bytes, visibility:'internal_only', status:'active',

uploaded_by_user_id OR source_token_id }
CF-20.1 only reads this; it adds no write path and no migration.

## Storage seam
`getStorageProvider()` → R2 provider when the four R2 vars are present; capture provider (in-memory, `capture://{key}` URLs) otherwise; fails loud (`STORAGE_NOT_CONFIGURED`) if misconfigured. `getSignedUrl(key, expiresInSeconds=300)` is the only viewing path — no raw-bytes get (same as the vendor and invoice-doc surfaces).
