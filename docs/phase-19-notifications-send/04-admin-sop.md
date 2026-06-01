# Phase 19 — Admin / Internal SOP

Audience: platform operators/maintainers. Covers the provider key, capture-by-default, the harness, and
the send audit trail.

## Enabling real email (the deploy step)

The send path is **capture-by-default**. `getSendProvider()` (`src/lib/integrations/send/index.ts`):
```
if (SEND_CAPTURE === "1" || !RESEND_API_KEY)  → CaptureProvider   (records, sends nothing)
else                                          → ResendProvider    (live email)
```
- **To enable real email:** set `RESEND_API_KEY` (and optionally `RESEND_FROM`, the verified sender) in
  the deployment environment. Do **not** commit the key — it is read via `process.env`, never stored in
  the repo.
- **To force capture even with a key** (staging/dry-run): set `SEND_CAPTURE=1`.
- Until a key is set, "Send" flips the message and records the attempt via the CaptureProvider — **no
  email leaves the system**.

## Running the phase-blocking harness

```bash
pnpm run db:check:notifications-send     # SANDBOX only; requires the SSH tunnel (port 3307)
```
- Rewrites `DATABASE_URL` → `…_sandbox` at module top and hard-exits (code 2) otherwise; **sets
  `SEND_CAPTURE=1` and deletes `RESEND_API_KEY`** so `ResendProvider` is never constructed.
- Self-seeds, exercises the real `sendCommunication` / `getExceptions`, asserts, tears down (idempotent).
- Green line: `PHASE-19 NOTIFICATIONS-SEND LEDGER GREEN ✓` (29/0).

## The send audit trail

Every send writes one `audit_logs` row:
```
action = "communication.sent"   → metadata { from, to:'sent',  jobId, provider }
action = "communication.failed" → metadata { from, to:'failed', jobId, provider, error }
```
A successful send also sets `communication_logs.provider_message_id` (the provider's id, or `cap_…` under
capture) and increments `attempts`. To review sends for a tenant:
```sql
SELECT created_at, action, target_id, metadata
FROM audit_logs
WHERE tenant_id = '<tenant>' AND action IN ('communication.sent','communication.failed')
ORDER BY created_at DESC;
```

## The exception feed

`/notifications` reads `getExceptions(tenantId)` (`src/server/analytics/exceptions.ts`) — pure reads over
`job_vendor_assignments` (status `SENT`), `change_orders` (`submitted`), and a filtered `operationalQueue`.
Detection is **wall-clock** (Option B); a business-hours-aware clock is banked (CF-19.1), seeded by the
`client_locations.timezone` column added in 0042.
