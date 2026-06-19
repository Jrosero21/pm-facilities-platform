# B-16.4 — Business Rules

- **BR1 — Completion = completed / total dispatches.** Total includes declined and cancelled dispatches;
  only Work Complete counts as completed. A decline/cancel counts against the vendor (work didn't get done).
- **BR2 — On-time = on-time / completed.** Computed over completed assignments only. On-time means arrival
  (earliest check-in, or the On-Site transition if no check-in) is at or before `scheduled_start_at`.
  A completed job with no arrival record counts as not-on-time (can't prove on-time → isn't).
- **BR3 — Composite score = (0.7 · completion + 0.3 · on-time) × 100.** Completion-dominant by operator
  decision; range 0–100.
- **BR4 — Shrinkage toward the population mean (K=5).** Each rate is pulled toward the unweighted
  population mean by `(n·rate + 5·mean)/(n+5)` before the composite, so thin-history vendors aren't
  over-credited or over-penalized on small samples.
- **BR5 — Per vendor × trade.** One score row per `(vendor_id, matched_trade_id)`; a vendor can rank
  differently across trades.
- **BR6 — `avg_rating` is null.** No rating-capture path exists; the field is reserved, never invented.
- **BR7 — Tenant-scoped + idempotent.** Scores are computed and read per tenant; recompute is
  delete-then-insert (no stale rows accumulate).
- **BR8 — Status by code.** Terminal/arrival statuses resolved by `code` (WORK_COMPLETE / ON_SITE), stable
  across display-name changes.
