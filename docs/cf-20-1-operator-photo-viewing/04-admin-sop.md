# CF-20.1 — Admin SOP

## Enabling real photo rendering (R2 / CF-iii.1)
The photo viewer is built and degrades honestly, but rendering **real** images requires object storage configured. Until then, every photo shows as an "Unavailable" tile (capture-by-default behavior — the storage factory fails loud / runs capture when R2 creds are absent).

To enable live rendering, set the four R2 variables in both environments:
- Dev: `.env.local` — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Prod runtime: same four variables

Once set, `getStorageProvider()` constructs the R2 provider and presigned URLs become real, fetchable image URLs. This same configuration unblocks the still-pending vendor-invoice-document render verify (it waits on the same R2 gate).

## Verifying the reader (gate)
Run the phase-blocking harness against the sandbox:
pnpm run db:check:job-photos
Expected: `HARNESS GREEN — all checks passed. (15/15)`, exit 0, 0 leftover rows. The harness self-seeds and tears down children-first under `FOREIGN_KEY_CHECKS=0`; it targets `jonnyrosero_pm_sandbox` (module-top env-swap) and never touches prod. The SSH tunnel must be open.

## Permission model
No new permission was added. The Photos section is ungated among viewers who can open the job (see 02-decisions.md D4 and 10-known-limitations.md L1). The security boundary is the reader's tenant + job scoping, not a UI gate.
