# Phase 20 — Admin / Internal SOP

Audience: platform operators/maintainers. Covers R2 go-live, capture-by-default, the env flags, and the
harness.

## Enabling real photo storage (R2 go-live)

The storage path is **capture-by-default**. `getStorageProvider()`
(`src/lib/integrations/storage/index.ts`):
```
if (STORAGE_CAPTURE === "1" || !R2_ACCESS_KEY_ID)  → CaptureStorageProvider   (no network, stores nothing)
else                                               → R2Provider                (live R2)
```
- **To enable real uploads:** set all four in the deployment environment:
  - `R2_ACCOUNT_ID` — the Cloudflare account id (used in the endpoint host).
  - `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — a **dedicated** R2 API token scoped to the bucket.
  - `R2_BUCKET` — the bucket name.
  - These are read via `process.env`, **never committed**.
- `R2Provider`'s constructor **throws `R2_CREDENTIALS_MISSING`** if any of the four is absent — it can
  never exist half-configured. Until all four are set, uploads run through the CaptureStorageProvider and
  **nothing is stored** (the action records the attempt; the writer would store bytes only against R2).

## Env flags

| Flag | Effect | Where |
|---|---|---|
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | real R2 (all four required) | deploy env |
| `STORAGE_CAPTURE=1` | force CaptureStorageProvider even with creds (staging/dry-run) | deploy/CI env |
| `STORAGE_FORCE_FAIL=1` | **test-only** — makes `CaptureStorageProvider.put()` return `{ok:false}` so the harness can exercise the failed-put guard. **Never set in production.** | harness only |

## Running the phase-blocking harness

```bash
pnpm run db:check:vendor-edge     # SANDBOX only; requires the SSH tunnel (port 3307)
```
- Rewrites `DATABASE_URL` → `…_sandbox` at module top and hard-exits (code 2) otherwise; **sets
  `STORAGE_CAPTURE=1` and deletes `R2_ACCESS_KEY_ID`** so `R2Provider` is never constructed (no real R2,
  no network).
- Self-seeds two vendors/users + a job + two assignments (+ a tenant-B fixture), exercises the real
  writer + `getVendorAttachmentUrl`, asserts, tears down (idempotent).
- Green line: `PHASE-20 VENDOR-EDGE LEDGER GREEN ✓` (17/0).

## Storage key scheme & audit

Object keys: `tenant/<tenantId>/job/<jobId>/attachment/<attachmentId>.<ext>` (ext from the MIME, not the
filename). Each real upload writes one `audit_logs` row `job_attachment.uploaded`
(`metadata:{jobId, assignmentId, size, mime, checksum, storageProvider, placeholder:false, …}`);
placeholders write `job_attachment.placeholder_created`.
