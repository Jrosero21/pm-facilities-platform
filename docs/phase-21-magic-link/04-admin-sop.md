# Phase 21 — Admin / Internal SOP

Audience: platform operators/maintainers. Covers the new `APP_URL` deploy var, how tokens behave, and
the security harness.

## Go-live: set `APP_URL` (the link base) — CRITICAL

The magic link is built as `${APP_URL}/link/<rawToken>` (`send-link.ts`, trailing slashes trimmed):
```
appBaseUrl() = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
```
- **`APP_URL` is a NEW deploy-time variable** — the **absolute, externally-reachable** base URL of the
  app (e.g. `https://app.yourdomain.com`). It is read via `process.env`, **never committed**.
- **A wrong or unset `APP_URL` produces dead links.** The dev fallback is `http://localhost:3000`,
  which a vendor on their phone cannot reach. **Set `APP_URL` in every non-local environment** before
  sending any link.
- This sits alongside the existing send/storage env: `RESEND_*` (Phase-19 email send) and `R2_*`
  (Phase-20 photo storage). A link delivery exercises **both** seams — the send seam to email the link,
  and the storage seam when a linkless vendor later uploads a photo.

## How tokens behave

- **Opaque + hashed.** The link carries a random token; the DB stores only its `sha256` hash
  (`magic_link_tokens.token_hash`). The raw token is in the email body **only** — never persisted,
  never logged, never shown in the operator UI.
- **Single-assignment.** A token is bound to exactly one `job_vendor_assignment`; it cannot reach any
  other job or tenant.
- **Expiring.** Default **7 days** (`expires_at`); after that it resolves invalid.
- **Revocable.** `revoked_at` invalidates it immediately (operator **Revoke** button → `revokeToken`,
  idempotent — a second revoke is a no-op).
- **Idempotent delivery.** `sent_at` records a successful send; a re-mark is guarded on `IS NULL`.
- **Uniform failure.** Missing / expired / revoked / forged all resolve to one quiet invalid result
  (no reason leak, no "exists but expired" signal).

## Running the phase-blocking security harness

```bash
pnpm run db:check:magic-link     # SANDBOX only; requires the SSH tunnel (port 3307)
```
- Rewrites `DATABASE_URL` → `…_sandbox` at module top and hard-exits (code 2) otherwise.
- Forces **both** capture backends — sets `STORAGE_CAPTURE=1` **and** `SEND_CAPTURE=1` and deletes
  `R2_ACCESS_KEY_ID` / `RESEND_API_KEY` — so **no real R2 and no real email** are ever reached.
- Self-seeds two vendors + vendor contacts (one **with** an email, one **without**), a shared job with
  two assignments, a no-email assignment, and a tenant-B fixture; replicates `resolveLinkContext` and
  calls the writers directly; asserts; tears down (idempotent).
- Green line: `PHASE-21 MAGIC-LINK LEDGER GREEN ✓` (**31/0**), across 8 groups.

## Audit & delivery trail

- A linkless write audits with `actorLabel = "linkless-vendor"` and a **NULL** acting user (the token
  id is the provenance, carried on `source_token_id`).
- A link send composes an `outbound_messages` row + a `communication_logs` row (`channel='email'`,
  `direction='outbound'`, `sourceType='outbound_message'`, `recipientType='vendor_contact'`) and runs
  it through `sendCommunication` — the same delivery + idempotency path as Phase-19 notifications.
