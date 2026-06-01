# Phase 18 — Admin / Internal SOP

Audience: platform operators/maintainers. Covers running the harness, the data the surfaces read,
and the audit trail.

## Running the phase-blocking harness

```bash
# requires the SSH tunnel up (port 3307) and a *_sandbox DB
pnpm run db:check:operator-review
```
- Runs **SANDBOX ONLY** — the script rewrites `DATABASE_URL` `jonnyrosero_pm` → `jonnyrosero_pm_sandbox`
  at module top and hard-exits (code 2) if the resolved URL is not a `_sandbox` DB.
- Self-seeds two T-A jobs (drafts in every status + vendor/operator/archived notes) and a tenant-B
  fixture, exercises the real readers/writer, asserts, then tears everything it created back down
  (idempotent — safe to re-run).
- Green line: `PHASE-18 OPERATOR-REVIEW LEDGER GREEN ✓`. Exit 0 on green, 1 on any red.

## What the surfaces read (data lineage)

- **Drafts tab** ← `listPendingReviewDraftsDetailed(tenantId)` over `update_rewrite_drafts` (status
  `pending_review`+`approved`), left-joined to `agent_decisions` (confidence/rationale) and inner-joined
  to `jobs`+`clients` (label). PULL only.
- **Vendor updates tab** ← `listVendorUpdates(tenantId)` over `job_notes` where `origin='vendor'` and
  `status<>'archived'`, inner-joined to `jobs`+`clients`. PULL only.
- **Vendor updates are stored in `job_notes` (`origin='vendor'`), NOT `vendor_update_logs`.** The
  latter is a dead Phase-6 forward-decl (no writer) — ignore it.

## The promotion audit trail

Every visibility promotion writes one `audit_logs` row:
```
action     = "job_note.visibility_promoted"
targetType = "job_note"
targetId   = <noteId>
userId     = <operator user id>
metadata   = { jobId, from, to }
```
To review promotions for a tenant:
```sql
SELECT created_at, user_id, target_id, metadata
FROM audit_logs
WHERE tenant_id = '<tenant>' AND action = 'job_note.visibility_promoted'
ORDER BY created_at DESC;
```
There is intentionally **no** corresponding `communication_logs` / `client_update_logs` row — promotion
is flip+audit only (Fork 1). If you see outbound rows tied to a promotion, that is a regression.

## Authorization

`/review` lives under the `(app)` route group whose `layout.tsx` redirects non-operators
(vendor/client users) out. The promotion action additionally requires `requireTenant()` and
tenant-scopes the note (`getJobNote` → `NOTE_NOT_FOUND` for cross-tenant ids). There is no vendor-scope
check on this operator path (by design).
