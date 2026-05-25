# Phase 4 Closeout — Jobs / Work Orders Foundation

## Phase Goal
Build the central job / work order object — the operational anchor every later phase (dispatch, communication, scope, billing, analytics) hangs off — source-agnostic from day one, with typed per-attribute history and a unified event stream.

## Completed Deliverables
- Schema for 11 tables across migrations 0007 + 0008 (InnoDB/utf8mb4, UUID v7 PKs): `priorities` (tenant-scoped) + `job_statuses` (global); the `jobs` spine; seven siblings (`job_contacts`, three `*_history`, `job_notes`, `job_attachments`, `job_events`); `tenant_job_sequences`.
- Create + read for jobs, contacts, and notes.
- Screens: `/jobs`, `/jobs/new`, `/jobs/[id]`; Jobs nav link.
- Transactional `createJob` (7 steps, one txn): per-tenant `job_number` allocation under a `FOR UPDATE` lock, the job row, initial status-history row, `job.created` event, and audit row.
- Source-agnostic `source_type` (8-value enum) from day one; per-tenant priorities + global statuses seeded with operator-facing descriptions for the Demo Aggregator.
- All 11 Phase 4 docs.

## Files Created or Changed
- Schema: `src/server/schema/job-reference.ts`, `jobs.ts`, `job-history.ts`, `job-details.ts`, updated `index.ts`.
- Migrations: `db/migrations/0007_absent_puma.sql`, `0008_mature_guardsmen.sql` (+ meta).
- Data layers: `src/server/job-reference.ts`, `jobs.ts`, `job-contacts.ts`, `job-notes.ts`, `job-events.ts`; additions to `client-locations.ts` (`listClientLocationsForTenant`) and `trades.ts` (`getTrade`).
- Actions: `src/app/(app)/jobs/actions.ts`, `contact-actions.ts`, `note-actions.ts`.
- UI: `src/app/(app)/jobs/**` pages; `src/components/job-form.tsx`, `job-note-form.tsx`; app-shell nav (added Jobs).
- Seeds/tooling: `db/seeds/job-reference.ts`; `db:seed:job-reference` script.
- Docs: `docs/phase-4-jobs/01..11`.

## Database Changes
See `08-db-changes.md`. 11 new tables across 2 migrations; `priorities` tenant-scoped, `job_statuses` global; jobs reference FKs RESTRICT, the 7 sibling→jobs FKs cascade; no uniqueness on `source_external_id`; all identifier names within 64 chars. Total recorded migrations: 9.

## API Routes / Server Actions Added
See `09-api-routes.md`. 3 pages, 3 server actions, and data-layer modules across jobs / job-reference / job-contacts / job-notes / job-events (plus `listClientLocationsForTenant` and `getTrade`).

## User-Facing Workflows Added
Create a job from a client location (trade + priority + problem); view the job list and detail; add contacts and notes (`03-user-sop.md`, `05-system-workflows.md`).

## Admin/Internal Workflows Added
Seed job-workflow reference data; apply the Phase 4 migrations; verify the job FK delete rules; inspect Phase 4 data; light up the deferred surfaces (`04-admin-sop.md`).

## Business Rules Added
See `06-business-rules.md` R-4.1…R-4.15: reference tenant/global split (R-4.1), source-agnostic source_type (R-4.2), per-tenant job_number under a row lock (R-4.3), the canonical 7-step createJob transaction (R-4.4), the audit inside-txn vs writeAuditLog split (R-4.5), tenant-scoped `*_NOT_FOUND` (R-4.6), create-returns-fresh-row (R-4.7), is_archived vs status (R-4.8), Completed vs Closed (R-4.9), visibility-from-day-one (R-4.10), event_type vocabulary (R-4.11), dependent-picker remount (R-4.12), form-required/DB-nullable trade+priority (R-4.13), initial-history-as-transition (R-4.14), seed-on-creation deficit (R-4.15).

## Chatbot Knowledge Added
See `07-chatbot-knowledge.md`: the 11-table map, the global-vs-tenant principle, source-agnostic architecture (ServiceChannel-isn't-a-value verbatim), the 7-step createJob transaction narrative, the two-history-layers + audit-split explanation, the Job #1 worked example, the audit/event vocabularies, and the "do not claim" list (no dispatch/scope/edit/visibility/attachments/billing yet).

## Verification Performed
```bash
pnpm lint         # clean
npx tsc --noEmit  # exit 0
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 9
mysql ... -e "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='jonnyrosero_pm' AND TABLE_NAME IN ('priorities','job_statuses','jobs','job_contacts','job_status_history','job_priority_history','job_trade_history','job_notes','job_attachments','job_events','tenant_job_sequences');"  # 11, InnoDB
# job_statuses confirmed global (no tenant_id); priorities tenant_id NOT NULL
# 7 sibling->jobs FKs all CASCADE; jobs reference FKs RESTRICT (clients/locations/trades/priorities/statuses), tenants CASCADE, users SET NULL
# Smoke test (server-side data layer + authenticated render) — Job #1
#   (019e603a-00c7-77de-b8e7-85259361aa07): Apple / Apple 5th Ave / Plumbing / High / New / Manual.
#   job_number=1; tenant_job_sequences.next_number bumped to 2; 1 status_history row (from NULL);
#   1 job.created event; 1 job.created audit (inside txn); +1 contact (Store Manager) +1 note,
#   each with a *.created audit (writeAuditLog, outside txn). /jobs and /jobs/[id] rendered 200
#   with the job, contact, note, and timeline. One probe false-negative (SSR comment marker on
#   the list "#1") investigated and confirmed non-defect (L-4.11).
```

## Known Limitations
See `10-known-limitations.md` L-4.1…L-4.12. Highlights: no edit/archive UI or status transitions (L-4.1); `job_attachments` schema-only (L-4.2); note visibility hardcoded (L-4.3); JobForm ships all locations / filters client-side (L-4.4); seed-on-tenant-creation deficit for priorities/statuses/sequences (L-4.5); deferred jobs indexes (L-4.6); no pagination/search/validation (L-4.7/L-4.8); trades lacks description (L-4.9); scope columns inert (L-4.10).

## Carry-Forward Items
- Edit + archive UI; status/priority/trade transitions (Phase 5 via the dual-write pattern).
- `job_attachments` data layer/UI + file-upload infrastructure; note-visibility workflow (Phase 6).
- Seed-on-tenant-creation hook for priorities + job_statuses + tenant_job_sequences (Phase 1).
- Deferred `(tenant_id, due_at)` / `(tenant_id, source_type)` indexes; list pagination/search/filter; field validation.
- `trades.description` column (close the Phase 3-era gap).

## Recommended Next Phase Focus
Phase 5 — Dispatch Workflow (`v0.6.0-phase-5`). The Phase 2–4 patterns hold (tenant-scoped tables, create+read screens, parent-in-tenant guards, the InnoDB + identifier guards). Orient on the new parts:

- **The capability layer meets the job:** Phase 5 matches a job (its `client_location`, `primary_trade`, `priority`) against the Phase 3 capability layer (`vendor_trade_coverage` + `vendor_service_areas`, with `vendor_compliance` for eligibility) via a **new cross-vendor query** (not an extension of `listVendorServiceAreas` — D-3.12). Geographic match needs coordinates, still unpopulated (Phase 3 L-3.4 / Phase 2 L-2.8).
- **`createDispatch` follows `createJob`:** assignment + `job_vendor_assignment_status_history` + `job_events` + audit, all in **one transaction with the audit inside it** (R-4.5). Reuse the 7-step template.
- **Status transitions begin here:** dispatching a vendor moves a job's status — write the transition as a `job_status_history` row + a `job_events` row (`job.status_changed`, `job.vendor_assigned`) + audit, together. The history tables and event vocabulary were built in Phase 4 for exactly this.
- **`job_statuses` is global, `priorities` tenant-scoped (D-4.1):** Phase 5's `dispatch_assignment_statuses` follow the **global** pattern.
- **Reuse the dependent-picker pattern (R-4.12)** for the vendor → vendor-location picker, and the generalized `ContactForm`/`ContactList` for any new contact surface.
