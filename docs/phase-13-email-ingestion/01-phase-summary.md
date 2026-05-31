# Phase 13 — Email Ingestion — Phase Summary

**Branch:** `phase-13-email-ingestion` · **Implementation commits:** `e999d4d → 5c47718` (7 batches) · target tag `v1.4.0-phase-13`.

## What Phase 13 delivered
The platform's **second external source channel — email** — structurally parallel to the Phase-12 external-portal framework (§2.1 source-agnostic). An inbound email becomes a reviewable **draft → job** on the same `jobs` substrate, with a human-approval gate (§2.5). The **data + API layer is complete and harness-proven**; the parser and the live receiver are deliberately stubbed/deferred.

## Built (committed)
- **6 `email_*` tables** across 3 migrations (0033–0035), sandbox + prod applied + contract-verified (prod at 99 tables / 36 migrations):
  - `email_parser_rules`, `email_ingestion_accounts` (0033) — config substrate.
  - `inbound_emails`, `email_attachments`, `email_parse_results` (0034) — storage + parse.
  - `email_work_order_drafts` (0035) — the reviewable draft (9 FKs).
- **Reader seam** (`src/lib/integrations/email/`) — `EmailReader` contract + `parser_kind` registry + two **stubbed** readers (deterministic, ai_assist), mirroring the Phase-12 `PortalAdapter`/registry. Never-throws contract routes every email to review.
- **Ingest engine** (`src/server/integrations/ingest-email.ts` — `ingestEmail`) — stored `inbound_emails` → parse → `email_parse_results` → resolve (guarded) → `email_work_order_drafts` @ `pending_review`. **Record-don't-apply: no job is created at ingest.** Dedup is flag-don't-reject.
- **Draft→job wrappers** (`approveEmailDraft` / `rejectEmailDraft` + shared `createJobFromDraft`) — approval creates the job via the unchanged `createJob` @ NEW (sourceType `email_ingestion`, createdBy = system user); the shared helper is the CF-13.1 autonomy seam.
- **Phase-blocking harness** (`scripts/check-email-ingestion.ts`) — **21 / 0 green** against sandbox.

## Deliberately NOT in this phase
- **Parsing is STUBBED** (CF-13.3) — both readers return failed/0-confidence; every email parks at `pending_review` until real per-format rules + the AI-assist prompt land.
- **No live mailbox receiver** (CF-13.2) — no IMAP/webhook/polling; the engine consumes already-stored `inbound_emails` rows.
- **No operator review-queue UI** (CF-13.7) — the data/API layer + wrappers exist and are harness-proven; the screens (+ AI-assist invocation) are an operator-portal-phase concern.
- **Email→client resolution column deferred** (CF-13.5) — D-1 keys resolution through the frozen `external_client_mappings`; the `external_system_id` link on `email_ingestion_accounts` is a deferred migration. The call site is dormant-but-correct.

## End-to-end reality today
`inbound_emails` (seeded/stored) → `ingestEmail` → `email_parse_results` + `email_work_order_drafts` @ pending_review (unresolved, stub parser) → an operator/real-parser resolves client+location → `approveEmailDraft` → real job @ NEW. With stub readers, a draft cannot be approved until its client + location are resolved (else `DRAFT_CLIENT_UNRESOLVED` / `DRAFT_LOCATION_UNRESOLVED`) — the honest current boundary.

## Commit ledger
`e999d4d` (13c 0033) → `fda9db9` (13d 0034) → `0724d6f` (13e 0035) → `e26594a` (13f seam) → `d932057` (13g ingest) → `b291b03` (13h approve/reject) → `5c47718` (13i harness).
