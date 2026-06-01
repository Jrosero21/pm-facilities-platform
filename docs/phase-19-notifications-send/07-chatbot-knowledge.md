# Phase 19 — Chatbot Knowledge

Knowledge the operations assistant can cite about Phase-19 notifications + send. (`searchKnowledge`
indexes this file; `readDoc` can fetch it in full.)

## The Notifications surface

- The operator portal has a **Notifications** page at `/notifications` — the exception queue. It lists,
  tenant-wide and most-urgent-first, the things that need a human: **vendor not accepted** (a dispatch
  sent to a vendor who hasn't accepted), **NTE increase requested** (a change order awaiting approval),
  and **operational** exceptions (jobs overdue / stalled / unassigned & high-priority).
- It is **detection + surface** only — it shows exceptions; it does not act on them. The operator clicks
  through to the job to re-dispatch, approve, etc. It is a PULL surface (no live push/badge).
- "Operational" exceptions exclude merely-old jobs ("aged") — only overdue/stalled/unassigned-high-priority
  qualify.

## Sending a communication (the live send backend)

- A composed/published communication can be **sent** for real. Sending resolves the full message content
  from its source (a client update or an outbound message — never the short summary), transmits via the
  email provider, and marks the message **Sent** (storing the provider's message id) or **Failed** (with
  the error).
- Sending is **operator-triggered** — nothing sends automatically (autonomous sending is a later phase).
- A message that's already been sent will not be sent again (idempotent — a re-click does nothing).
- The provider is **capture-by-default**: unless the deployment is configured with a provider key, "Send"
  records the attempt without transmitting real email. Email is currently the only channel (SMS is planned).

## Timing / SLA note

- Exception timing (how long overdue/stalled/unaccepted) is currently **wall-clock**, so an exception can
  surface outside a location's business hours. A business-hours-aware SLA clock is planned (the location
  timezone field exists; the clock logic is deferred).

## What Phase 19 does NOT do

- No SMS yet; no automatic responses to exceptions; no autonomous sending; no real-time browser push.
