# Phase 12 — Known Limitations

Limitations as-shipped. Each maps to a carry-forward in `closeout-carryforwards.md`. None blocks close — the framework is empirically green (25/0 @ `66b1377`); these are deliberate MVP boundaries + one documented edge.

## Framework-only (no live integration)
- **Skeleton adapter (CF-12.2).** `fetchWorkOrders` returns `[]`; `pushStatus` returns `{ok:true,'noop-skeleton'}`. No live HTTP, no credentials read. Real provider calls land in the live-integration phase.
- **Operator mapping UIs deferred (CF-12.3).** The mapping rows (client/location/status/trade/priority) exist + are exercised, but there are no admin screens to manage them — they're created directly (seed/harness today; an operator-portal phase later).
- **Encryption-at-rest deferred (CF-12.4, F1).** `external_credentials.encrypted_payload` is the shape; the encryption mechanism is decided when the first live adapter needs to store a real secret (no prior secret-storage pattern existed to inherit).

## Edges
- **IF-4 orphan window (CF-12.5).** `createJob` commits its own txn, then the ewol link is a separate insert. A failure between them leaves a job created-but-unlinked; a re-ingest (dedup misses, no link) would create a second job. There is no job-lookup by `source_external_id` to cheaply guard this, so it is documented rather than engineered around. The ewol unique still guards the normal concurrent double-ingest. Mitigation (a source-external-id reader / wrapping the link into the job creation) is deferred.
- **Auto-push-on-change is NOT wired (CF-12.1).** Outbound push is explicit (`pushStatusToExternal`) only; there are no hooks in the status/note writers and no `portal_update_queue` drain. The full auto-push workflow is the live-integration activation work.

## Inherited / cross-cutting
- **FB-10p.1** — the seed fixture is still named `seed-sandbox-phase9*` though it now seeds phases 9–12. Rename deferred to a boundary.
- **Standing watchpoints** (→ closeout-carryforwards): WP-12.1 (name the DB explicitly on this multi-DB server), WP-12.2 (pre-name FKs — long table names exceed 64 chars), the MariaDB-JSON-read gotcha (parse `json` columns at the read boundary), and the §10 buffering discipline (read harness verdicts from the captured file + true exit code, never an interleaved console — a console-read produced a false-green in 12k that had to be reset).
