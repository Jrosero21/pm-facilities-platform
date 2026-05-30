# Phase 11 — Operator / Admin SOP

How the client portal touches the operator-facing platform, and how to run the Phase-11 seed + harness.

## How client-submitted jobs reach you
- A client work order is an ordinary `jobs` row with **`source_type='internal_client_portal'`**, created via `createClientJob` → `createJob`. It enters at status **NEW** (direct-to-queue) with the full audit trail (`job_status_history` null→NEW, `job.created` event, `audit_logs`) — identical to an operator-created job.
- It arrives **unclassified**: `primary_trade_id` NULL, `priority_id` NULL, `not_to_exceed_amount` NULL. Triage it (trade, priority, NTE) in the operator job surface as usual.
- Filter/identify portal-origin jobs by `source_type`.

## How client updates (notes) appear
- A client update is a `job_notes` row with **`origin='client'`**, `visibility='client_visible'`. It shows in the operator job-notes surface like any note; the origin discriminates who authored it.
- To send a note **to** a client, author it (operator) with visibility **`client_visible`** (or `client_and_vendor_visible` to also show the vendor). The client portal's note reader surfaces exactly those visibilities (plus the client's own `origin='client'` notes). `internal_only` and `vendor_visible` never reach the client.
- Visibility is classification only — there is no auto-promotion workflow (FB-10l.2 still open). You set the visibility deliberately when you author the note.

## Proposals & invoices
- Send a proposal as usual (Phase 8). When it is `status='sent'`, it appears in the client's portal on the related job with an **Accept** button. Client acceptance calls `recordProposalAcceptance(decision='accepted')` — same writer, same `proposal_approvals` row + `proposal.accepted` event; the client user is the `approver_user_id`.
- Clients cannot decline in the portal (accept-only). To change a sent proposal, withdraw/revise it (Phase 8 revision chain).
- Client invoices appear in the portal only when `status='sent'`; the client sees the **total only** (OQ-6 — never markup/subtotal/line items). Drafts and voids never surface.

## Migration 0027 (client_users)
- One migration this phase: `0027_cloudy_squirrel_girl.sql` — `CREATE TABLE client_users` (6 cols, PK id, unique `(tenant_id, user_id, client_id)`, three cascade FKs, index `(tenant_id, client_id)`). Prod-applied (journal entry, prod migration count 28). No other schema change; `origin='client'` needed none (varchar column).

## Seed + isolation harness (sandbox)
The Phase-9 sandbox seed now seeds the Phase-11 surface too: a client user (`client@phase9seed.test`) mapped to **acme** (in-scope), with **globex** as an out-of-scope client; two `status='sent'` proposals (one in-scope, one out-of-scope); and client-visibility notes on the in-scope job.

```
# sandbox seed (self-targets *_sandbox; idempotent; destructive reset)
npx tsx --env-file=.env.local --conditions=react-server scripts/seed-sandbox-phase9.ts

# isolation harness — RE-RUN THE SEED FIRST (pattern 10: destructive + seed-dependent)
npm run db:check:client-portal
```

The harness writes a job, a note, and accepts a proposal in the sandbox; it is one-shot post-seed. A red assertion is a security defect — fix the code, never weaken the assertion. (The seed fixture file is still named `seed-sandbox-phase9*` though it now seeds phases 9+10+11 — rename deferred, `FB-10p.1`.)
