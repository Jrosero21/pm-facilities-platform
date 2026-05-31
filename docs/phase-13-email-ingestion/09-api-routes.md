# Phase 13 — Server Entry Points

**No HTTP routes / UI this phase** — Phase 13 is a data + API layer. The operator action wrapper + review-queue screens are deferred (CF-13.7). The entry points are server data-layer functions.

## Ingest
- **`ingestEmail({ inboundEmailId })`** — `src/server/integrations/ingest-email.ts`. Stored `inbound_emails` row → parse (reader seam) → `email_parse_results` + `email_work_order_drafts` @ pending_review; record-don't-apply (no job). Tenant scope derived from the row. Returns `IngestEmailResult` = `drafted | duplicate_flagged | parked_unmapped_client | failed`.

## Draft → job
- **`approveEmailDraft({ tenantId, draftId, reviewedByUserId })`** — same file. Lock+recheck pending → `createJobFromDraft` → `createJob` @ NEW → re-check-guarded link. Returns `{ jobId, draftId }`. Throws `DRAFT_NOT_FOUND | DRAFT_NOT_PENDING_REVIEW | DRAFT_CLIENT_UNRESOLVED | DRAFT_LOCATION_UNRESOLVED`.
- **`rejectEmailDraft({ tenantId, draftId, reviewedByUserId, reason? })`** — lock+recheck pending → `draft_status='rejected'`. Returns `{ draftId }`. Throws `DRAFT_NOT_FOUND | DRAFT_NOT_PENDING_REVIEW`.
- **`createJobFromDraft(draft, { tenantId })`** (internal, not exported) — the shared readiness+job-build helper; the CF-13.1 autonomy seam.

## Reader seam (`src/lib/integrations/email/`)
- **`core/types.ts`** — `EmailReader`, `EmailParseDraft`, `EmailReaderInput`, `EmailParserKind`, `EmailParseOutcome`, `EmailSourceType` (pure types).
- **`core/registry.ts`** — `registerReader(kind, reader)`, `getReader(kind)` (throws `UNKNOWN_PARSER_KIND`), `hasReader(kind)`, `listRegisteredReaders()`.
- **`readers/deterministic/`, `readers/ai-assist/`** — the two stub readers (self-register on import).
- **`index.ts`** — the family barrel; importing it registers both readers.

## Reused (frozen) dependencies
- `createJob` (`@/server/jobs`) — called unchanged (@ NEW).
- `getSystemUserId` (`@/server/integrations/system-user`) — SF-1 attribution.
- `resolveTrade` / `resolvePriority` / `external_client_mappings` (`@/lib/integrations/core/mapping`) — D-1 resolution (read-only).
- `createLocation` (`@/server/client-locations`) — SF-2 auto-stub (guarded).
- `writeAuditLog` (`@/server/audit`).

## Error vocabulary
`INBOUND_EMAIL_NOT_FOUND`, `SYSTEM_USER_NOT_SEEDED`, `DRAFT_NOT_FOUND`, `DRAFT_NOT_PENDING_REVIEW`, `DRAFT_CLIENT_UNRESOLVED`, `DRAFT_LOCATION_UNRESOLVED`, `UNKNOWN_PARSER_KIND` + the reused Phase-4 `createJob` errors.
