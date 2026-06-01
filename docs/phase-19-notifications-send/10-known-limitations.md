# Phase 19 — Known Limitations

## Functional boundaries (by design / locked decisions)

- **SLA/exception timing is wall-clock-approximate.** Overdue/stalled/unaccepted dwell is measured in
  wall-clock seconds, so an exception can surface **outside a location's business hours**. The
  business-hours-aware clock is **banked (CF-19.1)** — the `client_locations.timezone` column landed in
  0042 as its seam, but no Phase-19 logic consumes it.

- **No SMS.** Email only. The `SendProvider` interface is channel-agnostic and SMS-ready, but the Twilio
  adapter is **banked (CF-19.2)**.

- **No-same-day-on-site exception not detected.** Banked (**CF-19.3**) — it depends on the business-hours
  clock (CF-19.1).

- **Detection only — no auto-response.** `getExceptions` surfaces; it does not act (no auto-re-dispatch).
  Auto-response is **Phase 28**; autonomous sending is **Phase 23**.

- **PULL, not push.** `/notifications` refreshes on navigation — no realtime/websocket/unread-badge.

## Operational / soft items (banked)

- **Real email requires `RESEND_API_KEY` at deploy.** Capture-by-default until then — "Send" records the
  attempt without transmitting. (See `04-admin-sop.md`.)

- **`change_orders` has no `submitted_at`.** `nte_increase_requested` sorts by `updated_at` as a proxy for
  the submit time (a precise timestamp would come from `change_order_approvals` — banked refinement).

- **Resend `Idempotency-Key` window vs `failed→sent` retry.** A genuine `failed` row retries via
  `failed→sent`, reusing the same `commId` as the Idempotency-Key. If a prior attempt actually reached
  Resend (but we recorded it failed), the provider's idempotency window could dedupe the retry. Verify the
  exact interaction when the live key is wired (soft note).

## Documentation correction (cross-cutting)

- **Roadmap §9 has a CF-12 numbering error** (`02-gpt-project-roadmap-v2.md`): it lists a non-existent
  "CF-12.x outbound send" as retired by Phase 19, and swaps the CF-12.1/CF-12.4 labels relative to the
  actual bank. Phase 19 built the **email send backend** (never a numbered CF item) and touched **none** of
  CF-12.1–12.5 (the ServiceChannel external-platform track, all still open). Tracked as **CF-19.4** — a
  separate, gated roadmap doc-fix (not edited in this phase).

## Inherited / standing

- Standard watchpoints (pnpm not npm; MariaDB JSON parse-at-read; SSH tunnel for DB scripts; sandbox→prod
  migration cadence) carry forward unchanged.
