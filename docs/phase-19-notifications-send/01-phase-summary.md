# Phase 19 — Phase Summary

**Phase:** 19 — Notification Center + Exception Queue + Live Send Backend (v2.2.0-phase-19).
**Branch:** `phase-19-notifications-send` (off `main@db95ac9`, the Phase-18 close).
**Outcome:** the platform's **first real outbound send backend** (Resend behind a `SendProvider`
adapter, capture-by-default) + a tenant-wide **exception queue** at `/notifications`, on the **first
v2 migration (0042)**. Regression-protected by a 29-assertion phase-blocking harness.

## What Phase 19 is

The nervous system of "manage by exception" (roadmap §2.7) plus the send **mechanism** that the
Phase-18 "no outbound" boundary pointed at. Three pieces:

- **Live send backend** — `sendCommunication` wraps the existing delivery-status flip: compose →
  resolve the real source content → `provider.send()` → flip to `sent` (store `provider_message_id`)
  or `failed` (store `last_error`, bump `attempts`). The provider is **capture-by-default**
  (`getSendProvider()` returns `CaptureProvider` unless `RESEND_API_KEY` is set and `SEND_CAPTURE!=1`);
  `ResendProvider` is the live email impl (raw `fetch`, no SDK). Operator-triggered only — **not**
  autonomous (Phase 23).
- **Exception detection** — `getExceptions(tenantId)` folds three kinds into one sorted list:
  `vendor_not_accepted` (assignment status `SENT`), `nte_increase_requested` (`change_orders.status='submitted'`),
  and `operational` (filtered `operationalQueue` — overdue/stalled/unassigned-high-priority; pure-`aged` excluded).
- **Notification surface** — `/notifications`, a PULL Server Component over `getExceptions`. Plus the
  job-detail "Send" button rewired through the real (capture) send path.

## Schema posture — ONE migration (0042), additive only

The **first v2 migration**. Four additive columns, no new tables:
- `communication_logs` += `provider_message_id` (varchar 255), `attempts` (int default 0), `last_error` (text).
- `client_locations` += `timezone` (varchar 64, IANA) — **data-model only; nothing consumes it in Phase 19**
  (the seam for the banked business-hours SLA clock, CF-19.1).

Table count unchanged at **115**; migration ledger at **0042** (sandbox + prod). See `08-db-changes.md`.

## The send seam (files)

`src/lib/integrations/send/` — `provider.ts` (interface + `SendRequest`/`SendResult`), `resend-provider.ts`,
`capture-provider.ts`, `index.ts` (`getSendProvider` factory). Wired via `sendCommunication` +
`resolveSendContent` (`src/server/communications.ts`) and `sendCommunicationAction`
(`communication-actions.ts`). Exception readers in `src/server/analytics/exceptions.ts`;
`/notifications` route + `exception-queue.tsx`.

## Commits

Migration unit `a2b7b0c` (0042). Feature `<feature-hash>` (send seam + detection + surface). Harness +
docs `<harness-docs-hash>`. (Hashes filled into `11-closeout.md` at gate time.)

## Verification

`pnpm run db:check:notifications-send` — **29/0 GREEN on two clean runs** (groups A send-path /
B idempotency / C capture-honesty / D exception readers + isolation / E write-boundary). `pnpm exec
tsc --noEmit` → exit 0; `pnpm run lint` → 0 errors; `pnpm run build` → clean, `/notifications` present.
The CaptureProvider keeps the harness honest: with `SEND_CAPTURE=1` and no key, `ResendProvider` is
never constructed and no real email is sent.

## Session update (follow-up pass — 2026-06-15)

A later pass on the Phase-19 substrate. Two things landed; no Phase-19 file was rewritten — both are additive.

- **Send backend LIVE-VERIFIED.** A real email was delivered end-to-end through `ResendProvider` (a real
  `providerMessageId` came back), and the fail-loud path was confirmed (a bad recipient returned a Resend
  `403 validation_error`, flipping the row to `failed` — never a silent mis-send). Still **capture-by-default**:
  real send requires `RESEND_API_KEY` **and** a verified-domain `RESEND_FROM`. Today `RESEND_FROM` is the
  Resend sandbox sender (`onboarding@resend.dev`), which only delivers to the account owner. **No prod host
  yet** — prod send config (key + verified-domain From on the host, `SEND_CAPTURE` absent) is a future
  when-hosted step. The exception/notifications surface and the exact send wire were re-confirmed against the
  real DB (read-only) as part of this pass.
- **NEW feature — job follow-up (next action).** `jobs.follow_up_at` + `jobs.follow_up_category` (migration
  0053): a categorized "next action" reminder, settable on the job **edit** form, shown on the detail page,
  audited via a `job.follow_up_changed` timeline event. An overdue follow-up surfaces as a **4th exception
  kind**, `follow_up_overdue` (purple "Follow-up due"), in the `/notifications` queue — open-job + tenant
  scoped. See `02-decisions.md` (D-19.12+), `08-db-changes.md` (0053), `09-api-routes.md`, `10-known-limitations.md`.
