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

---

# Decisions — follow-up pass (2026-06-15): job follow-up (next action)

## D-19.12 — Follow-up is its OWN field, not a repurposed `due_at`

The next-action reminder is a **net-new pair** (`follow_up_at` + `follow_up_category`), Option B over
Option A (repurpose the orphaned `due_at`). `due_at` is reserved for a future **client/SLA deadline** — a
distinct concept that also feeds the `operational`/overdue exception tier. A categorized operator reminder
and an SLA due-date are different things; conflating them onto one column (and hanging a category off a
"due date") would muddy both. `due_at` is left untouched.

## D-19.13 — Fixed enum category, not a tenant lookup table

`follow_up_category` is a 4-value `mysqlEnum` (`vendor_followup` / `confirm_onsite` / `proposal_followup` /
`general`), matching the `billing_model` / `rate_type` inline-enum precedent — the set is fixed and
app-controlled. Operator-configurable (per-tenant) follow-up categories are **banked**; a lookup table
shaped like `priorities` is the upgrade path if that's ever wanted.

## D-19.14 — Blank date = explicit CLEAR; a date REQUIRES a category (pairing rule)

The edit form always submits `follow_up_at`, so a present-but-blank value is an **explicit clear** → both
fields null (the writer force-nulls the category alongside a cleared date — never an orphan category). A
**set** date requires one of the four categories, or the action returns *"Pick a follow-up type when
setting a follow-up date."* Category is not HTML-`required` (a job may have neither); the pairing is
enforced server-side so the only blocked combo is date-without-type.

## D-19.15 — Edit-only for MVP; create-time banked

Follow-up is settable on the **edit** form only. Setting one at job-creation is a fast follow-on
(**banked**) — the primary workflow is parking a reminder on a job already in flight.

## D-19.16 — Wall-clock overdue (consistent with the other 3 kinds)

`follow_up_overdue` fires on raw elapsed time, like `vendor_not_accepted` / `nte_increase_requested` /
`operational`. The business-hours clock (**CF-19.1**) stays banked and now also applies here.

## D-19.17 — TIMEZONE (durable): client-written datetimes compared in JS, never SQL `NOW()`

`follow_up_at` is **client-written** (an operator-picked Date stored via mysql2 in **UTC**); the MySQL
session runs **UTC−4**. So `SQL: follow_up_at < NOW()` / `TIMESTAMPDIFF(…, NOW())` compares across
timezone frames and **silently inverts** (a 2h-past follow-up read as 2h future). The overdue test +
`ageSeconds` are therefore computed in **JS** (`value.getTime() < Date.now()`) — mysql2 round-trips the
stored value back to the correct instant, so a JS comparison is frame-safe. This mirrors
`operationalQueue`'s `dueAt` check. **DB-written timestamps (`defaultNow()`, `sql\`now()\``) ARE in the
server frame, so SQL `NOW()` math is fine for those** (e.g. `sent_at` dwell). The trap is specifically
client-supplied datetimes; it was hit **twice** this pass (the form round-trip needs local-time
formatting, not `toISOString`; and the `follow_up_overdue` reader). Also in the learnings store:
`memory/reference-client-datetime-overdue-js-not-sql.md`.
