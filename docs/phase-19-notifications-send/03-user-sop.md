# Phase 19 — User SOP (Operator)

Audience: aggregator operators. Surfaces: **Notifications** (top nav → `/notifications`) and the
job-detail **Communications** section.

## Triaging exceptions (Notifications)

1. Open **Notifications** from the top nav. It lists everything that needs a human, across all your
   jobs, **most urgent first** (sorted by how long it's been waiting).
2. Each row shows a **kind badge**, the job (**#job-number · client**, click to open), an **age**
   ("6h", "2d"), and a one-line detail:
   - **Vendor not accepted** — a dispatch was sent to a vendor who hasn't accepted yet (with how long
     it's been waiting). Open the job to re-dispatch or follow up.
   - **NTE increase requested** — a change order is awaiting your approval (with the amount + reason).
     Open the job to approve/decline.
   - **Operational** — a job that's **overdue**, **stalled**, or **unassigned & high-priority** (with
     time in current status).
3. There is no action button on the exception row itself — click through to the job to act. The queue
   is **detection + surface**; it does not act for you.

> The queue updates when you navigate to it (a PULL surface) — there is no live ticker or badge.

## Sending a communication

1. On a job's **Communications**, a message you've composed/published shows with a delivery status
   (Draft / Queued / Sent / …).
2. To send it for real, click **Send**. This calls the configured email provider, then marks the
   message **Sent** (or **Failed**, with the error, if the provider rejected it).
3. **Mark** buttons (Mark delivered / Mark failed / Mark queued) remain for manual status corrections —
   only **Send** actually transmits.

> If sending shows "No recipient email on this message" or "Couldn't resolve the message content,"
> the message is missing a recipient or its source content — fix the source and retry.
>
> Re-clicking **Send** on an already-sent message does nothing (it won't double-send).

## What this phase does NOT do

- No SMS yet (email only).
- No automatic responses — exceptions are surfaced for you to act on, not auto-resolved.
- No real email is sent until the deployment is configured with a provider key; until then "Send"
  records the attempt without transmitting (ask your admin — see `04-admin-sop.md`).
