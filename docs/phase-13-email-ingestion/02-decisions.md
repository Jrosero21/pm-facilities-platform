# Phase 13 — Decisions

Locked decisions + resolved open questions. Each cites its proving harness assertion where one exists (groups A–F in `scripts/check-email-ingestion.ts`).

## Locked decisions (from 13b)
- **D-1 — sender→client resolution.** Parse the client identifier out of the email body and resolve it through the **existing Phase-12 `external_client_mappings` resolver** (one resolution system). The sender address is a **coarse router only**, never the authoritative key. *Why:* one resolution truth; sender addresses are spoofable/shared.
- **D-6 — source_type provenance.** One pipeline; `email_ingestion` = arrived at a monitored intake address, `forwarded_email` = a human forwarded it. Discriminated at the `email_ingestion_accounts` level, stamped onto the job's `source_type` at approval (D2). *Why:* both enum values already exist on `jobs.source_type`; the distinction is provenance, not a separate pipeline.
- **D-7 — parser rules are config-only (INVARIANT).** `email_parser_rules` holds format + sender-router + extraction config ONLY; **no client→id mapping** (proven F1). *Why:* a second client→id store would reintroduce the dual-truth D-1 forbids.

## Resolved open questions (from 13b-final)
- **OQ-13.1 — draft lifecycle.** `draft_status` enum = `pending_review / approved / rejected / superseded`. **Partial resolution is NOT a separate state** — it's a `pending_review` row with one or more `resolved_*` null (B3). `inbound_emails.processing_status` = `received / parsed / drafted / failed / duplicate_flagged`.
- **OQ-13.2 — attachments.** `email_attachments.storage_ref` is a **reference only — no in-DB blobs**; physical backend deferred (CF-13.4).
- **OQ-13.3 — confidence scale.** `decimal(5,4)`, continuous 0.0000–1.0000, stored precise. *Why (autonomy-enabling):* CF-13.1's auto-create threshold becomes a config change, not a schema change.
- **OQ-13.4 — dedup.** **Flag-don't-reject**, keyed on `message_id`, uniform across intake types: a repeat is STORED + flagged `duplicate_flagged` for operator adjudication, never DB-rejected nor silently allowed. The `(tenant_id, message_id)` index is therefore a **non-unique detection lookup** (proven C1–C3, incl. the live NON_UNIQUE=1 guard).
- **OQ-13.5 — partial resolution policy (Path 2, asymmetric).** Unresolved **location** auto-stubs from the email address + hard-flags (Phase-12 SF-2); unresolved **client** parks (Phase-12 IF-7) — client = billing entity, never stubbed.
- **OQ-13.6 — see D-7.**

## Implementation-time decisions (13g/13h)
- **Resolution keying = option (a), column deferred (CF-13.5).** Resolve via `external_client_mappings` keyed on the account's `external_system_id` — but that column is a deferred migration. The engine's resolution site is written forward-compatibly (`accountExternalSystemId` currently `null`), so it compiles + is correct when the column lands; with stub readers it always takes the park branch.
- **Draft→job identity (D-5).** `reviewed_by_user_id` = the approving **operator**; the job's `createdByUserId` = the **system user** (email-origin provenance). Both preserved, never collapsed (D2/D3).
- **IF-4 ordering (CF-13.6).** `createJob` runs its own txn, so it is called OUTSIDE the draft-lock txn; the draft is then linked with a re-check-guarded update. A 0-row guard match → audit the orphan, don't throw (the job is real).
- **CF-13.1 seam.** The readiness-check + job build live in the shared `createJobFromDraft`; `approveEmailDraft` adds only the human-approval gate (one commented §2.5 line). The future autonomous path calls the helper directly after a confidence check.
