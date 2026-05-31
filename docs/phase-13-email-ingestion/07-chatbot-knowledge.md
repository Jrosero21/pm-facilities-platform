# Phase 13 — Chatbot / Agent Knowledge

Phase-16-facing concept map of the email-ingestion subsystem.

## What it is
Email ingestion is the platform's **second external source channel** (after the Phase-12 external-portal framework). A client emails or forwards a work request; the system turns it into a reviewable **draft → job** on the same `jobs` substrate. It is **source-agnostic** (§2.1): email is one channel among many, structurally parallel to the external-portal family.

## Tables (6, migrations 0033–0035)
- `email_ingestion_accounts` — the monitored intake identities + the `source_type` provenance discriminator (`email_ingestion` / `forwarded_email`).
- `email_parser_rules` — **config-only** format/extraction/sender-router rules (D-7: NO client→id mapping).
- `inbound_emails` — the raw received message (⚠ distinct from the Phase-6 `inbound_messages`).
- `email_attachments` — file references (no in-DB blobs).
- `email_parse_results` — the parser's structured output (+ a continuous `confidence`).
- `email_work_order_drafts` — the reviewable draft (`pending_review/approved/rejected/superseded`).

## Entry points (server data layer)
- `ingestEmail({ inboundEmailId })` — parse a stored email → draft (record-don't-apply; no job).
- `approveEmailDraft({ tenantId, draftId, reviewedByUserId })` — draft → job @ NEW.
- `rejectEmailDraft({ tenantId, draftId, reviewedByUserId, reason? })`.
- `getReader(kind)` / `listRegisteredReaders()` — the reader seam.

## Boundaries an agent must respect
- **Parsing is stubbed** (CF-13.3) — readers return failed/0; drafts park unresolved until real rules land.
- **No live receiver** (CF-13.2) and **no review UI** (CF-13.7) — the data/API layer is complete and harness-proven (21/0), the surfaces are deferred.
- **Approval needs a resolved client + location** — an unresolved draft cannot become a job.
- **Dedup flags, never deletes** — a duplicate is `duplicate_flagged`, preserved for review.
- **The autonomy seam exists** (CF-13.1): `createJobFromDraft` + the continuous `confidence` field are built so a future high-confidence auto-create branch bolts on without schema change — but it is NOT active; every job today passes the human-approval gate (§2.5).

## Resolution model
Client/location/trade/priority resolution reuses the **frozen Phase-12 `external_client_mappings` / `core/mapping.ts` resolvers** (D-1, one resolution system). Parser rules never resolve identities.
