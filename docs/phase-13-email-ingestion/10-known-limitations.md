# Phase 13 — Known Limitations

Limitations as-shipped. Each maps to a carry-forward in `closeout-carryforwards.md`. None blocks close — the data/API layer is empirically green (21/0 @ `5c47718`); these are deliberate MVP boundaries + one documented edge.

## Framework-only (parsing + transport deferred)
- **Stubbed parser (CF-13.3).** Both readers (`deterministic`, `ai_assist`) return a failed/0-confidence draft. No real per-format field extraction, no LLM call. **Consequence:** every ingested email parks at `pending_review` with nothing resolved — an operator (or a future real reader) supplies client/location/codes. Real extraction logic + the AI-assist prompt drop into the existing seams when sample emails exist.
- **No live email receiver (CF-13.2).** No IMAP / webhook / mailbox polling. The engine consumes already-stored `inbound_emails` rows; the transport that creates them is the activation layer.
- **No operator review-queue UI (CF-13.7).** The data/API layer + `approve`/`reject` wrappers exist and are harness-proven, but there are no screens (and no AI-assist invocation surface). Deferred to the operator-portal phase.
- **Email→client resolution column deferred (CF-13.5).** D-1 resolves via the frozen `external_client_mappings`, keyed on an `external_system_id` that `email_ingestion_accounts` does not yet carry (deferred migration). The engine's resolution site is written forward-compatibly (`accountExternalSystemId` currently `null`) — dormant-but-correct; it activates when the column lands.
- **Attachment physical-storage backend deferred (CF-13.4).** `email_attachments.storage_ref` is a reference only; no bytes destination (object store / disk) is wired. No in-DB blobs.

## Edges
- **Approve→link orphan window (CF-13.6).** `createJob` commits its own txn, then the draft-link is a separate re-check-guarded update. If the draft changes between job-commit and link, the job exists but isn't linked to the draft; the engine **audits the orphan (`email_draft.approve_link_orphan`) rather than throwing** (the job is real). The IF-4 / CF-12.5 analog. Mitigation (a job-lookup-by-source-external-id guard) deferred.

## End-to-end honesty
Email → approved-job is NOT yet a hands-off pipeline: it requires (a) a stored inbound row (no live receiver), and (b) a resolved client + location on the draft (no real parser). Both gaps are the deferred CF items above; the substrate they feed is complete and proven.

## Cross-cutting / inherited
- Inherited open items roll forward unchanged — see `closeout-carryforwards.md`.
- **Watchpoints:** WP-13.1 (`inbound_emails` ≠ `inbound_messages`), WP-13.2 (stale `tsconfig.tsbuildinfo` replays phantom tsc errors → `rm` it), MariaDB-JSON parse-at-read.
