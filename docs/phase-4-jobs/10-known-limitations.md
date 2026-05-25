# Phase 4 — Known Limitations

Everything intentionally not built, done "for now," or worth knowing before later phases. Includes carry-forwards. Inherits the still-load-bearing Phase 1–3 gotchas (InnoDB-must-be-forced, 64-char identifier guard, case/accent-insensitive collation, no tenant-switcher UI, per-event audit metadata).

## L-4.1 — No edit / archive / delete UI for jobs
Jobs, contacts, and notes support **create + read only**. No UI to edit a job, change its status/priority/trade, archive it (`is_archived` exists but nothing flips it), or delete anything. **Carry-forward:** edit + archive UI, and status/priority/trade transitions (transitions arrive with dispatch in Phase 5, which writes them through the dual-write history+event+audit pattern).

## L-4.2 — `job_attachments` is schema-only (no data layer / UI)
The table exists but has no data-layer module, action, or UI; no file upload. Gated on file-upload infrastructure (same deferral as Phase 3 `vendor_documents`). `file_url`/`file_size_bytes`/`file_mime_type` stay null. **Carry-forward:** wire it up when upload infra lands (`04-admin-sop.md` SOP-4.E).

## L-4.3 — No note-visibility control (hardcoded internal_only)
`job_notes.visibility` exists (5-value enum) but `JobNoteForm` exposes no picker — every Phase 4 note is `internal_only`. **Carry-forward:** Phase 6 owns the visibility picker + the vendor/client-sharing workflow.

## L-4.4 — JobForm ships all tenant locations and filters client-side
The new-job form ships every tenant `client_location` to the browser at page-render and filters by selected client in client state (option d — no fetch). Scales to dozens of clients/locations fine. **Carry-forward:** at hundreds of locations (Phase 11+ scale), switch to async fetch — load locations on client-select via a server action/read endpoint. Not a Phase 4 concern.

## L-4.5 — Reference + sequence rows depend on a missing seed-on-tenant-creation hook
`JobForm`'s trade/priority pickers and `createJob`'s number allocation assume the tenant has seeded `priorities`, `job_statuses` (global, shared), and a `tenant_job_sequences` row. **All three** need a "seed on tenant creation" hook that Phase 1's tenant-creation flow doesn't have yet — same root cause. Phase 4 hand-seeds the Demo Aggregator. Symptoms if missing: empty priority/status `<select>`s causing confusing client-side validation; no sequence row (the `createJob` lazy `ON DUPLICATE KEY` ensure covers *that* one defensively, but priorities/statuses have no fallback). **Carry-forward (Phase 1):** the tenant-creation seed hook + broken-seed-state error handling.

## L-4.6 — Deferred `jobs` indexes
`(tenant_id, due_at)` (Phase 5 SLA/overdue view) and `(tenant_id, source_type)` (Phase 9/12 source analytics) are **not** created — no consuming query yet; the consumer defines the right composite (D-3.11 discipline, D-4.12). **Carry-forward:** add in the consuming phase.

## L-4.7 — No list pagination / search / filter
`/jobs` returns all non-archived jobs (newest first). Fine at current scale; needs pagination/search/filter for large tenants. **Carry-forward** (extends Phase 2 L-2.6/L-2.9, Phase 3 L-3.13).

## L-4.8 — No field-level validation beyond required-attribute
Problem description, scope, contact email/phone are free-text; no format validation or normalization. **Carry-forward** (extends Phase 2 L-2.7, Phase 3 L-3.10).

## L-4.9 — `trades` lacks a `description` column
Phase 4 added `description` to `priorities` + `job_statuses` (D-4.2), but `trades` (Phase 3) still has none. A one-line ALTER + backfill someday — not a blocker, not a Phase 4 task. **Carry-forward:** close the gap when convenient (the reference-table description pattern is now established).

## L-4.10 — Scope columns are inert in Phase 4
`generated_scope_of_work` / `approved_scope_of_work` / `scope_generation_status` exist on `jobs` but are never written by operator flows (`scope_generation_status` stays `not_started`). **Phase 7** (AI scope generation) owns this lifecycle and the `scope_generation_status` vocabulary.

## L-4.11 — SSR comment-marker quirk on the `/jobs` list (test-author note)
A naive substring probe like `html.includes("#1")` against the rendered `/jobs` list returns false even though the job renders correctly — React SSR emits `#<!-- -->1` (an invisible comment marker between the `#` literal and the `{jobNumber}` expression). Caught during the Phase 4 smoke test; **not a defect** (the browser shows "#1"). Documented so a future test author doesn't chase the same false negative — match on a stable token (the job id, client name) or strip comment markers.

## L-4.12 — Setup/test data present (the Job #1 worked example)
The `demo` tenant contains Phase 4 verification data: **Job #1** (Apple / Apple 5th Ave / Plumbing / High / New / Manual) with one contact (Store Manager) and one note ("Vendor dispatched for emergency response."), plus its `job_status_history` / `job_events` / `audit_logs` rows and the seeded priorities (5) / global statuses (8) / `tenant_job_sequences` row (now at next_number=2). Real, append-only records; left in place (the worked example in `07-chatbot-knowledge.md` K-4.10).
