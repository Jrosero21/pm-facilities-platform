# Phase 18 — Chatbot Knowledge

Knowledge the operations assistant can cite about the Phase-18 review surfaces. (`searchKnowledge`
indexes this file; `readDoc` can fetch it in full.)

## The Review surface

- The operator portal has a **Review** page at `/review` with two tabs: **Drafts** (AI-draft review
  queue) and **Vendor updates** (vendor-updates inbox). It is tenant-scoped and cross-job — one place
  to triage everything awaiting a human, instead of opening jobs one by one.

## AI-draft review queue (Drafts tab)

- Lists `update_rewrite_drafts` at status `pending_review` (awaiting decision) and `approved`
  (awaiting publish), across all of the tenant's jobs. Published, rejected, and discarded drafts are
  not shown — the queue is the actionable set.
- Operators **approve** (optionally editing the client-facing text), **reject** (with a reason),
  **discard** (silent), or **publish** an approved draft to the client portal. These reuse the same
  Phase-6/16 writers used on the per-job surface; the draft gate (§2.5) is unchanged.

## Vendor-updates inbox (Vendor updates tab)

- Lists vendor-submitted notes — `job_notes` with `origin='vendor'`, excluding archived. Vendor
  updates always arrive **internal-only** and are never automatically visible to the client.
- An operator can **promote** an internal-only (or requires-review) vendor note to **client-visible**
  or **client + vendor**. Promotion changes who is allowed to see the note and records an audit entry;
  it does **not** send or publish anything (the send backend is a later phase).
- Promotion is restricted to those two client-facing targets — it cannot set arbitrary visibility or
  demote a note.

## Where vendor updates are stored

- Vendor updates live in **`job_notes`** (tagged `origin='vendor'`), not in `vendor_update_logs`
  (an unused legacy table). The inbox reads `job_notes`.

## What Phase 18 does NOT do

- No outbound delivery / notifications (that is the notification center + send backend, a later phase).
- No autonomous actions — the review surfaces are for human triage; the "acted autonomously" lane is
  documented groundwork only, with no producer yet.
