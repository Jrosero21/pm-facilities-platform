# CF-20.1 — API Routes / Server Functions

**No new HTTP routes and no new server actions.** This sub-feature adds two **server-side reader functions**, called within the job-detail page's server loader. No `route.ts`, no `"use server"` action was added.

## Readers (src/server/job-attachments.ts)

### `listJobPhotos(tenantId: string, jobId: string): Promise<JobPhotoRow[]>`
Lists active photo attachments for a job, tenant-scoped, newest first. `JobPhotoRow = { id, title, attachmentType, fileMimeType, fileSizeBytes, hasFile, createdAt }`. `hasFile = storage_key != null`.

### `getJobPhotoUrl({ tenantId, jobId, attachmentId }): Promise<JobPhotoUrlResult>`
Resolves a 300s presigned URL for one photo, tenant + job scoped. Discriminated result, no existence leak:
- `{ kind: 'url'; url; expiresInSeconds }`
- `{ kind: 'placeholder' }` — row exists, no `storage_key`
- `{ kind: 'unavailable' }` — presign failed (incl. storage not configured)
- `{ kind: 'forbidden' }` — row not in (tenant, job, photo) scope; identical to nonexistent

## Consumption
`src/app/(app)/jobs/[id]/page.tsx` calls `listJobPhotos` in its loader, then resolves all URLs up-front via `Promise.all(... getJobPhotoUrl ...)`, mapping each to `JobPhotoTile { id, title, sizeBytes, mimeType, url: kind==='url' ? url : null }`, passed to `<JobPhotosPanel>`.
