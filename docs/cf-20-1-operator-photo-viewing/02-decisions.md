# CF-20.1 — Decisions

## D1 — Reader is tenant + job scoped, NOT vendor author-scoped
Two reader-gate precedents existed: the vendor-side author-scoped reader (`get-vendor-attachment-url.ts`, scoped to the uploading vendor) and the operator-side tenant-scoped reader (`getVendorInvoiceDocumentUrl`, "any operator in the tenant may serve any document on this parent"). Operators are not a vendor, so we cloned the **operator-side, tenant-scoped** pattern: any operator in the tenant may view any photo on a job in their tenant, scoped by the foreign key (`jobId`) so arbitrary ids can't be probed.

## D2 — No-existence-leak discriminated result (the security property)
`getJobPhotoUrl` returns `url | placeholder | unavailable | forbidden`. A row outside the (tenant, job, photo) scope returns `forbidden` — **identical** to a nonexistent id — so the reader leaks no existence signal across tenant or job boundaries. This is the load-bearing property; the harness asserts it directly (cross-tenant probe and cross-job probe both → `forbidden`, not `url`/`placeholder`).

## D3 — Module home: new operational `src/server/job-attachments.ts`
Not co-located under `billing/` (where the invoice-doc reader lives, because it's billing) nor under `vendor/` (the author-scoped vendor reader). Photos read by operators are operational evidence; operators are neither billing- nor vendor-scoped for this surface. A clean operational module matches what the code is.

## D4 — Panel UNGATED — deliberate deviation from the banked spec
**The Phase-20 banked CF-20.1 spec named "an operator permission gate."** We shipped the panel **ungated**. Reason: the sibling operational sections on the job-detail page — Dispatch, Notes, Contacts — render to anyone who can open the job; `canSeeOperations`/`canOperate` gates only *action buttons*, not section visibility. Gating photos while their siblings render freely would be inconsistent and would hide vendor before/after photos from a finance role viewing the job to settle billing (a real use case — photos are often the proof behind an invoice). The reader's tenant+job scoping is the actual security boundary; panel visibility among already-authorized viewers should match the operational cluster. **This is a reasoned deviation, recorded here and in 10-known-limitations.md so the discharge is honest** — the banked spec predated seeing the siblings are ungated.

## D5 — Thumbnail grid, not a text list
The invoice-doc renderer is a text list (PDFs you click to open). Photos are the opposite — the point is glanceable before/after evidence. A text list would discharge CF-20.1 in letter while defeating its purpose. Thumbnails via presigned URLs; click opens full-size.

## D6 — Presigned URLs resolved up-front in the loader
Mirroring the invoice-doc page: the server component resolves all presigned URLs in the loader (one `getJobPhotoUrl` per photo, parallel) and passes resolved `url: string | null` to a pure renderer. `placeholder`/`unavailable`/`forbidden` all collapse to `url: null` → the renderer shows a muted tile. Keeps the renderer presentation-only and the degrade honest.

## D7 — Harness made a permanent gate, relocated to convention
`scripts/check-job-photos.ts` (flat in `scripts/`, `check-<feature>.ts`, matching siblings) wired as `db:check:job-photos`. The no-leak discipline is a security property worth guarding against future refactors, not an ephemeral one-time check.
