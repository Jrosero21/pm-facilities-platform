# Phase 13 — User SOP (operator-facing)

How email-sourced work orders flow, and what an operator does. **Note:** the operator review-queue UI is deferred (CF-13.7); this SOP describes the workflow the data/API layer supports today (exercised by the harness, not yet a screen).

## The lifecycle of an email work order
1. **Received.** An inbound email is stored as an `inbound_emails` row (`processing_status='received'`). (The live receiver that creates these rows is deferred — CF-13.2; today rows are seeded/created by an operator action or a future webhook.)
2. **Parsed → drafted.** `ingestEmail` runs the deterministic reader and writes an `email_parse_results` row, then an `email_work_order_drafts` row at `pending_review`, and sets the inbound row to `processing_status='drafted'`. **No job is created yet** (record-don't-apply).
3. **Operator review.** The operator opens the pending draft, confirms/corrects the resolved **client**, **location**, trade, and priority. *(With the current stub parser, drafts arrive unresolved — the operator supplies client + location.)*
4. **Approve → job.** On approval the system creates a job at status **NEW** (`source_type` = the account's provenance: `email_ingestion` or `forwarded_email`; `source_external_id` = the email's Message-ID). The draft is marked `approved` and linked to the new job.
5. **Reject.** A spam/irrelevant draft is rejected (`draft_status='rejected'`), with an optional reason. No job is created.

## What an operator must know
- **Approval requires a resolved client AND location.** Approving a draft with either unresolved fails with `DRAFT_CLIENT_UNRESOLVED` / `DRAFT_LOCATION_UNRESOLVED` — resolve them first. (This is the normal state until real parsing lands — CF-13.3.)
- **Duplicates are flagged, not lost.** A repeat email (same Message-ID within the tenant) is stored and flagged `duplicate_flagged` for the operator to adjudicate — it does NOT auto-create a second draft, and it is never silently dropped (OQ-13.4).
- **A draft is a one-time gate.** Once approved or rejected, re-approving fails with `DRAFT_NOT_PENDING_REVIEW`.
- **Provenance is preserved.** The resulting job records that it originated from the email pipeline (`created_by` = the system integration user) AND who approved it (`reviewed_by_user_id` = you).

## Not yet available (deferred)
- The review-queue screen + AI-assist "suggest fields" button (CF-13.7 + CF-13.3).
- Automatic email receipt (CF-13.2) and automatic high-confidence auto-create (CF-13.1).
