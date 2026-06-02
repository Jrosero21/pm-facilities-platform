# Phase 21 — Chatbot Knowledge

Knowledge the operations assistant can cite about Phase-21 linkless vendor access. (`searchKnowledge`
indexes this file; `readDoc` can fetch it in full.)

## Operators can send an unregistered vendor a secure link

- From a job's dispatch page, an operator can **Send link** — emailing the vendor contact a **secure,
  single-use-style magic link** that opens **one** work-order assignment **with no account**. The button
  is disabled when the assignment has **no contact email** (one must be set first).
- The vendor opens the link and can **accept/decline the dispatch, confirm an ETA, confirm the schedule,
  mark on-site, mark work complete, add a note, and upload a photo** — **without logging in**.
- An operator can **Revoke** a link at any time; the token list shows each link's state (active / unsent
  / expired / revoked).

## A link reaches exactly one work order

- A magic link is bound to **one** assignment — it **cannot** reach any other job or any other tenant's
  data. Bad, expired, revoked, or tampered links all show the **same** "this link is no longer valid"
  message (no information about whether a link ever existed).
- Links **expire after 7 days** and are **revocable** immediately. Re-sending mints a **fresh** link
  (old ones aren't reused).

## What a link-holder can and cannot do

- They **can** update status, add notes, and upload photos for that one assignment.
- They **cannot** submit an **invoice** (that requires a registered vendor account), and they **cannot**
  see any other job.
- Notes and photos a link-holder adds are captured **internal to the aggregator** (`internal_only`) —
  **not** automatically shown to the client; an operator decides what's shared.

## A vendor sees only what came through their own link

- On a job shared by two vendors, each magic link surfaces **only** the notes/photos added through
  **that** link — a link cannot see the other vendor's contributions, even on the same job.

## Delivery is configured at deploy time

- Sending a link requires the deployment to have an app base URL (`APP_URL`) and an email backend
  configured; until then links are not deliverable. This is an operations/deploy concern, not a
  per-user setting. (Photo upload through a link uses the same object-storage backend as registered
  vendor uploads.)
