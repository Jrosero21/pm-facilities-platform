# Phase 20 — Known Limitations

## Functional boundaries (by design / locked decisions)

- **Operator-side photo viewing deferred.** There is no operator attachment reader/gate — operators
  cannot browse vendor-uploaded photos in the aggregator portal yet (vendor author-scope is the only
  reader). → **banked CF-20.1**.

- **Presigned URLs are issuance-scoped, not per-fetch.** A served URL is a short-lived (5-minute) bearer
  token — authorization is enforced when the URL is generated (the scope gate), not on each fetch. Anyone
  with the link can read within the window. Acceptable for a 5-minute read; not for long-lived links.

- **Orphan object on insert-failure-after-put.** The common failure (put fails) writes **no row**
  (harness 5c). The reverse — put succeeds, then the DB insert fails — would leave an unreferenced object
  in R2; there is no sweep job. → **banked CF-20.2**.

- **Capture-by-default until R2 is configured.** Real uploads require the four `R2_*` env vars; until set,
  the no-op CaptureStorageProvider runs and nothing is stored. R2 go-live is a separate deploy step
  (`04-admin-sop.md`).

- **`STORAGE_FORCE_FAIL` is a test-only hook** on the capture provider (capture-backend only, unreachable
  in any production path). It exists so the harness can exercise the failed-put guard without R2.

## Soft / future

- **`vendor_documents` shares the same NULL-`file_url` placeholder pattern** (insurance certs, W-9s,
  licenses) and could reuse this storage adapter in a later phase — out of scope here.

- **FB-10a.4 legacy-row backfill not performed.** Existing placeholder `job_attachments` rows (NULL file
  columns) stay placeholders; only new uploads carry bytes. The FB-10a.4 obligation's backfill sub-clause
  was out of scope (a soft residual).

## Cross-cutting / disposition

- **CF-13.4 is NOT retired by this phase.** CF-13.4 is the **email** attachment backend
  (`email_attachments.storage_ref`) — part of the email-ingestion track, untouched here. The R2
  `StorageProvider` seam Phase 20 built is the reusable blob backend CF-13.4 was waiting for, so its
  blocker is **partially discharged**, but the email wiring is not done. It rolls forward open.

- **Roadmap §6 + §9 wrongly state "Retires CF-13.4 (Phase 20)."** This conflates CF-13.4 (email) with
  FB-10a.4 (vendor photos, the item actually retired). Recorded as a doc-correction carry-forward
  (**CF-20.3**, analogous to CF-19.4); the roadmap file is not edited in this phase.

## Inherited / standing

Standard watchpoints (pnpm not npm; MariaDB JSON parse-at-read; SSH tunnel for DB scripts; sandbox→prod
migration cadence; confirm the resolved DB name before any prod DDL) carry forward unchanged.
