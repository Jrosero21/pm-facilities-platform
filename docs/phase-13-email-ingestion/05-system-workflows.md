# Phase 13 — System Workflows

The runtime flows of the email-ingestion subsystem. All functions are server data-layer (`"server-only"`); authz lives in the (deferred) action wrapper (CF-13.7).

## 1. Ingest (`ingestEmail({ inboundEmailId })`)
Source: `src/server/integrations/ingest-email.ts`. Mirrors the Phase-12 `core/ingest.ts` ordering, but lands a **draft**, not a job (record-don't-apply).

1. **Load + scope.** Load the `inbound_emails` row; `tenantId` is derived FROM the row, never from parsed content. Not found → `failed`.
2. **System attribution.** `getSystemUserId()` (SF-1; throws `SYSTEM_USER_NOT_SEEDED`).
3. **Dedup (flag-don't-reject).** If another `inbound_emails` row shares `(tenant_id, message_id)` with a different id → set this row `processing_status='duplicate_flagged'`, audit, return `duplicate_flagged`. No draft, no hard-reject.
4. **Parse (never throws).** Parse `raw_headers` at the read boundary (`parseJsonColumn`); build `EmailReaderInput`; `getReader('deterministic').parse(input)` → `EmailParseDraft`. (AI-assist is operator-invoked inside review — §2.5 — not auto-run here.)
5. **Resolve (guarded, dormant with stubs — CF-13.5).** If an extracted client code + the account's `external_system_id` are present, resolve via the frozen `external_client_mappings`; else flag `client_unresolved_stub` (the park branch). Location (SF-2) + trade/priority (IF-1) resolution are likewise guarded.
6. **Write (one txn).** Insert `email_parse_results` (`extractedFields` as a JSON object; `confidence` as a decimal string), then `email_work_order_drafts` @ `pending_review` (resolved_* possibly null), then transition the inbound row → `processing_status='drafted'`.
7. **Audit + return.** `writeAuditLog('email.drafted', actorLabel='system:email-ingest')`. Returns `drafted` (or `parked_unmapped_client` if a client was extractable-but-unmapped).
- On throw: best-effort `processing_status='failed'` + audit + return `failed`.

## 2. Approve (`approveEmailDraft({ tenantId, draftId, reviewedByUserId })`)
1. **Lock + recheck.** `db.transaction` → `SELECT … FOR UPDATE` the draft (tenant-scoped) → `DRAFT_NOT_FOUND` / re-check `draft_status='pending_review'` → `DRAFT_NOT_PENDING_REVIEW`; release the lock.
2. **§2.5 / CF-13.1 boundary** — the human-approval gate (one commented line). The future autonomous path calls `createJobFromDraft` directly after a confidence check, skipping only this gate.
3. **Create the job (IF-4 ordering).** `createJobFromDraft` (shared helper): readiness check (`DRAFT_CLIENT_UNRESOLVED` / `DRAFT_LOCATION_UNRESOLVED`) → load the inbound Message-ID → `createJob` @ NEW (own txn; `sourceType` = draft's, `sourceExternalId` = Message-ID, `createdByUserId` = system user).
4. **Link (re-check-guarded — CF-13.6).** `UPDATE drafts SET created_job_id, draft_status='approved', reviewed_by_user_id, reviewed_at WHERE … AND draft_status='pending_review'`. If 0 rows (draft changed under us after the job committed) → audit `email_draft.approve_link_orphan`, return without throwing (the job is real). Else audit `email_draft.approved`.

## 3. Reject (`rejectEmailDraft({ tenantId, draftId, reviewedByUserId, reason? })`)
`db.transaction` → lock + recheck pending → `UPDATE draft_status='rejected', reviewed_*` (no job) → audit `email_draft.rejected`.

## 4. Reader seam (`src/lib/integrations/email/`)
`getReader(kind)` resolves a registered `EmailReader` (throws `UNKNOWN_PARSER_KIND` otherwise); the two stub readers self-register on import of the family barrel. `parse()` never throws — an unreadable email returns a failed/0 draft (the review-routing mechanism). §2.1: core never imports a concrete reader.
