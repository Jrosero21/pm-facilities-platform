# CF-20.1 — Chatbot Knowledge

**Feature:** Operators can view vendor-uploaded before/after photos on a job's detail page, in a thumbnail grid under the Photos section (after Dispatch, before Contacts).

**Where photos come from:** Vendors upload them (registered vendors or via linkless magic-link). Photos persist to object storage and are recorded in `job_attachments` with `attachment_type='photo'`.

**Visibility:** Photos are internal (aggregator-only). Operators see them; they are not client-visible and are not auto-shared with clients.

**Who can see them:** Any operator or finance user who can open the job. There is no separate photo permission.

**If photos show "Unavailable":** The image can't be served because object storage (Cloudflare R2) isn't configured in the environment yet, or the record is metadata-only with no uploaded file. The viewer is built correctly and will render real images once R2 is configured. This is the standing storage prod-blocker (CF-iii.1), shared with vendor-invoice document viewing.

**Technical:** Reader is `src/server/job-attachments.ts` (`listJobPhotos`, `getJobPhotoUrl`), tenant + job scoped, no-existence-leak discriminated result. No new database table or migration — reads existing `job_attachments`. No API endpoints — server-side readers called in the job-detail page loader. Gate: `pnpm run db:check:job-photos`.
