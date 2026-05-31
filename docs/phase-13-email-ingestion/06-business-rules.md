# Phase 13 — Business Rules

Each rule cites its proving assertion in `scripts/check-email-ingestion.ts` (21/0 green @ `5c47718`).

| Id | Rule | Proof |
|---|---|---|
| **R-13.1** | **Record-don't-apply.** `ingestEmail` records a parse result + a `pending_review` draft; it NEVER creates a job. The job is created only at operator approval. | B1 (drafted), B2 (parse_results), B3 (draft pending_review), **B4 (no job at ingest + status='drafted')** |
| **R-13.2** | **Dedup is flag-don't-reject.** A repeat `(tenant_id, message_id)` is stored and flagged `duplicate_flagged`; never DB-rejected, never silently allowed, no second draft. | C1 (duplicate_flagged + no new draft), C2 (row still exists), **C3 (live `inbound_emails_tenant_message_idx` NON_UNIQUE=1)** |
| **R-13.3** | **Approve → job attribution.** Approval creates a job @ NEW with `source_type` = the account's provenance (`email_ingestion`/`forwarded_email`), `created_by` = the system user, `source_external_id` = the email's Message-ID. | D1 (jobId), D2 (sourceType/createdBy=system/NEW), D4 (sourceExternalId=message_id) |
| **R-13.4** | **Dual identity preserved.** The draft records the approving operator (`reviewed_by_user_id`) AND the job records system provenance (`created_by`) — never collapsed. | D2 (createdBy=system) + D3 (reviewer=operator) |
| **R-13.5** | **Readiness gate.** Approval requires a resolved client AND location; otherwise it fails cleanly (no partial job). | E1 (`DRAFT_CLIENT_UNRESOLVED`, no job), E2 (`DRAFT_LOCATION_UNRESOLVED`) |
| **R-13.6** | **One-time review gate.** A draft can be approved/rejected once; re-approving a non-pending draft fails. | E4 (`DRAFT_NOT_PENDING_REVIEW`) |
| **R-13.7** | **Tenant isolation.** Draft reads/updates are tenant-scoped; a cross-tenant approve cannot see the draft. | E5 (cross-tenant → `DRAFT_NOT_FOUND`) |
| **R-13.8** | **Reject creates no job.** Rejection marks the draft `rejected` with the reviewer, no job. | E3 |
| **R-13.9** | **Parser rules are config-only (D-7).** `email_parser_rules` has no client→id column and no FK to clients; client resolution lives in `external_client_mappings`. | **F1 (schema invariant, live)** |
| **R-13.10** | **Reader seam is source-agnostic.** Readers self-register by `parser_kind`; an unknown kind throws rather than silently no-ops. | A1/A2 (both registered), **A3 (`UNKNOWN_PARSER_KIND`)** |
| **R-13.11** | **parse() never throws.** An unreadable email yields a failed/0-confidence draft routed to review (not an exception that loses the audit trail). | B2 (deterministic/failed/0 from the stub) |
| **R-13.12** | **Confidence is continuous (CF-13.1-enabling).** `email_parse_results.confidence` is `decimal(5,4)` stored precise, so the future auto-create threshold is a config change. | B2 (confidence column exercised) + 08-db-changes |

## Inherited rules in force
- **§2.5** AI output is a reviewable draft, never an auto-applied result (the approve gate; AI-assist is operator-invoked).
- **§2.1** source-agnostic — email is one channel; core imports no concrete reader (R-13.10).
- **IF-7 / SF-2** (Phase-12 analogs) — unresolved client parks; unresolved location auto-stubs (guarded, dormant with stub readers — see 05/10).
