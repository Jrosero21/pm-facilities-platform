# Phase 19 — Decisions

## D-19.1 — Resend, behind a `SendProvider` adapter

The live email backend is **Resend**, reached through a channel-agnostic `SendProvider` interface
(`src/lib/integrations/send/`). The server never imports a concrete provider — it calls
`getSendProvider()`. `ResendProvider` uses raw `fetch` against `api.resend.com/emails` (no SDK package —
the dependency-light lean, matching the servicechannel adapter precedent).

## D-19.2 — Email-only; SMS banked

The interface is channel-agnostic (`to`/`body` carry an email now; SMS reuses the shape with `to`=phone),
but only the email path ships. A Twilio SMS adapter is **banked (CF-19.2)** — the seam is ready.

## D-19.3 — Factory over registry

Provider selection is a simple env-keyed factory (`getSendProvider`, mirroring `llm-routing`'s
presence-check), **not** a self-registration registry. With only two impls selected by env, a factory is
the right weight; the registry pattern (email/external families) exists for open-ended, DB-keyed provider
sets.

## D-19.4 — CaptureProvider for harness honesty

`CaptureProvider` records payloads in-memory and sends nothing. `getSendProvider()` returns it when
`SEND_CAPTURE=1` **or** `RESEND_API_KEY` is absent. THE HONESTY GUARANTOR: in that branch `ResendProvider`
is **never constructed** — and since `ResendProvider`'s constructor throws without a key, a successfully
returned `capture` provider proves the live impl was never built. The harness asserts this (group C).

## D-19.5 — Provider columns on `communication_logs`, not `portal_update_queue`

`provider_message_id` / `attempts` / `last_error` were added to `communication_logs` — already the
delivery state machine (channel/recipient/delivery_status). `portal_update_queue` is portal-targeted
(no email channel, no recipient email) and would split one delivery record across two tables.

## D-19.6 — Resolve full source content, never the summary

`communication_logs` carries only a 500-char `summary` excerpt; the real body lives in the polymorphic
source row. `resolveSendContent` reads `client_update_logs.content` (subject derived from the job) or
`outbound_messages.subject`+`body`, keyed by `source_type`. An unsupported source throws
`UNRESOLVABLE_SEND_SOURCE` — it **never** falls back to sending the truncated summary.

## D-19.7 — Two-layer idempotency (§2.6)

`sendCommunication` guards a double-send: (a) `provider_message_id`-present / already-`sent` short-circuits
**before** any provider call; (b) the legal-transition guard (`draft/queued/failed → sent`). A `failed`
row carries no `provider_message_id`, so `failed→sent` retries are correctly allowed. The Resend
`Idempotency-Key` header (= `commId`) is the provider-level backstop. Harness group B proves a double-fire
captures exactly once.

## D-19.8 — `/notifications` single list; tabs deferred

The exception queue is a single sorted list (mirroring `VendorUpdatesInbox`), not tabbed — `getExceptions`
is one feed today. The route is named "Notifications" to host future feeds (autonomy events, spend-ceiling)
without a rename; tabs land when a second feed arrives.

## D-19.9 — SLA clock = Option B (wall-clock ships; business-hours logic banked)

Exception detection (overdue/stalled, vendor-not-accepted dwell, NTE pending-since) uses **wall-clock**
elapsed time. The roadmap's "client_location_hours + timezones" clock-correctness invariant is **half-
satisfiable**: hours exist, but **no timezone data did** — so 0042 adds a `timezone` column (data-model
only) as the seam, and the business-hours-aware elapsed function is **banked (CF-19.1)**. Wall-clock
detection can fire outside business hours; that's the accepted Option-B tradeoff until CF-19.1.

## D-19.10 — Exception scope; no-same-day-on-site banked

In scope: `vendor_not_accepted`, `nte_increase_requested`, and **filtered** `operationalQueue`
(overdue/stalled/unassigned-high-priority; pure-`aged` excluded — aged is "old", not blocking). The
no-same-day-on-site exception is **banked (CF-19.3)** — it depends on the business-hours clock.

## D-19.11 — PULL surface, not push; detection only, not auto-response

`/notifications` is a PULL Server-Component render (refreshed on navigation), not browser push /
websockets / realtime / unread-badges (consistent with Phase 18). `getExceptions` **detects** — it does
not act. Auto-response (re-dispatch to vendor B) is **Phase 28**; autonomous sending is **Phase 23**.
