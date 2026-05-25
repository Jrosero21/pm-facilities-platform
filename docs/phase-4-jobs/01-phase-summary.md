# Phase 4 — Phase Summary

## Phase Name
Jobs / Work Orders Foundation

## Version
`v0.5.0-phase-4`

## Phase Goal
Build the central job / work order object — the operational anchor every later phase (dispatch, communication, scope generation, billing, analytics) hangs off — source-agnostic from day one, with typed history and a unified event stream.

## In Scope
- Schema for 11 tables across two migrations: reference tables `priorities` (tenant-scoped) + `job_statuses` (global); the `jobs` spine; the seven siblings `job_contacts`, `job_status_history`, `job_priority_history`, `job_trade_history`, `job_notes`, `job_attachments`, `job_events`; and the `tenant_job_sequences` counter.
- Create + read for jobs, job contacts, and job notes.
- Screens: `/jobs`, `/jobs/new`, `/jobs/[id]`.
- Transactional `createJob` (7 steps, one DB transaction): per-tenant `job_number` allocation, the job row, initial status-history row, `job.created` event, and audit row.
- Source-agnostic `source_type` (8-value DB enum) from day one.
- Per-tenant priorities + global job statuses, seeded for the Demo Aggregator with operator-facing descriptions.

## Out of Scope (deferred)
- Full dispatch workflow (Phase 5); AI scope generator UI (Phase 7); vendor portal (Phase 10); client portal (Phase 11); email parser (Phase 13).
- Edit / archive / delete UI for any entity (create + read only this phase).
- `job_attachments` data layer / UI (schema-only; gated on file-upload infrastructure).
- Note-visibility picker (`job_notes.visibility` hardcoded `internal_only`; Phase 6 owns the workflow).
- List pagination / search / filter; field-level validation beyond required-attribute.
- Rich event timeline (Phase 6 owns the timeline UX; Phase 4 renders a plain list).

## Status
Complete. Branch `phase-4-jobs`, tag `v0.5.0-phase-4`. Builds on Phase 3 (`v0.4.0-phase-3`).

## Pointers
- Decisions: `02-decisions.md` (D-4.1 … D-4.20 — dense, as expected for the central operational entity)
- The "why" behind the flows: `05-system-workflows.md`, `06-business-rules.md`
- Chatbot source-of-truth: `07-chatbot-knowledge.md`
- DB changes: `08-db-changes.md`
- Known limitations: `10-known-limitations.md`
- Closeout: `11-closeout.md`
