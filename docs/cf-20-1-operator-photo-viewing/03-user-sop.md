# CF-20.1 — User SOP (Operator)

## Viewing vendor photos on a job
1. Open the job from the jobs list (`/jobs/[id]`).
2. Scroll to the **Photos** section, in the operational area of the page (after Dispatch, before Contacts).
3. Vendor-uploaded before/after photos appear as a thumbnail grid, newest first.
4. Click any thumbnail to open the full-size image in a new tab.

## What you'll see
- **A thumbnail** — a vendor-uploaded photo with a stored file. Click to view full size.
- **An "Unavailable" tile** — the photo record exists but the image can't be served right now. This is expected until object storage (R2) is configured in the environment; the wiring is correct and lights up once R2 is live. A title-only photo record (metadata with no uploaded file) also shows this way.
- **"No vendor photos on this job yet."** — no photos have been uploaded for this job.

## Notes
- Photos are **internal** — they are vendor-uploaded evidence captured into the aggregator, not client-visible. The section label states this.
- Any operator (or finance role) who can open the job can see its photos. There is no separate permission to view photos beyond access to the job.
