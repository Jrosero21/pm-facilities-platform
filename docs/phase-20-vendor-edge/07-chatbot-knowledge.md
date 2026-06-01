# Phase 20 — Chatbot Knowledge

Knowledge the operations assistant can cite about Phase-20 vendor photo storage. (`searchKnowledge`
indexes this file; `readDoc` can fetch it in full.)

## Vendors can now upload real photos

- A vendor on a work order can **attach a real photo** (not just a titled placeholder). On a phone the
  form opens the camera directly; on desktop it's a file pick. Accepted: JPG, PNG, WEBP, HEIC, up to
  15 MB.
- Photos are stored in **object storage** (Cloudflare R2) and shown in the job's Photos list as a
  thumbnail, served via a **short-lived signed URL** (valid a few minutes; the page reissues it on load).
- A vendor may still attach a **title-only placeholder** (no file) — the prior behavior.

## Visibility — internal by default

- Vendor-uploaded photos are **internal to the aggregator** (`internal_only`) — they are **not**
  automatically visible to the client. Sharing is an operator decision (the capture-then-review rule).

## Scope — vendors see only their own

- A vendor sees and can open only the attachments uploaded within their own vendor scope on their
  assignments. Photos from another vendor (even on the same job) or another tenant are not accessible —
  and a request for one is indistinguishable from a request for a non-existent photo (no information
  leak).

## Operators cannot view photos yet

- There is **no operator-side photo viewer** yet — operators cannot browse vendor-uploaded photos in the
  aggregator portal in this phase (deferred). Only the uploading vendor's scope can view them today.

## Storage is capture-by-default until configured

- Real uploads require the deployment to be configured with R2 credentials. Until then the platform runs
  a no-op capture backend (nothing is actually stored). This is an operations/deploy concern, not a
  per-user setting.
