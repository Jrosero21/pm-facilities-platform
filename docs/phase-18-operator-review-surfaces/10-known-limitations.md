# Phase 18 — Known Limitations

## Functional boundaries (by design / locked decisions)

- **No outbound on promotion (Fork 1).** Promoting a vendor note to client-visible changes visibility
  + writes an audit row only. It does **not** email/notify the client or write any
  `communication_logs` / `client_update_logs`. Outbound delivery is **Phase 19** (notification center +
  live send backend). Until then, a promoted note is visible in-portal but nothing is *sent*.

- **No autonomous lane (dual-mode is groundwork only).** The queue is structured to host a future
  "acted autonomously — inspect/undo" lane, but none is rendered and no draft/note status enum value
  was added. There is no producer of autonomous actions until the policy engine (**Phase 23**).

- **Promotion targets are restricted.** From this surface a note can only be promoted to
  `client_visible` or `client_and_vendor_visible` — no demotion, no arbitrary visibility, no
  `vendor_visible`-only path. (A vendor-visible-only sharing flow, if ever needed, is out of scope.)

## UX / soft items (banked)

- **Queue omits the original source note.** The per-job draft section shows the originating note body
  inline; the cross-job queue does not fetch source-note bodies (they span jobs). Operators click the
  `#job · client` link to the job for full context. *Banked* as a soft-UX item — could be added with an
  extra join if desired.

- **No `(tenant_id, origin)` index on `job_notes`.** `listVendorUpdates` does a tenant-prefix scan with
  an `origin` post-filter. Fine at current volume; *banked* as a soft perf item to keep the phase
  migration-free.

## Inherited / cross-cutting

- The vendor-update store is `job_notes` (`origin='vendor'`); `vendor_update_logs` remains a dead
  forward-decl (see `08-db-changes.md`).
- Standard standing watchpoints (pnpm not npm; MariaDB JSON parse-at-read; SSH tunnel for DB scripts;
  read harness verdicts from a file + true exit) carry forward unchanged.
