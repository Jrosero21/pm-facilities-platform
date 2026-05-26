# Phase 5 Closeout — Dispatch Workflow

## Phase Goal
Let operators assign vendors to jobs: surface capable/in-area/compliance-eligible vendors for a job (the Phase 3 capability layer meeting the Phase 4 job), capture a dispatch at draft, send it (notifying the vendor and advancing the job to Dispatched), and record every step as immutable history + a timeline event + an audit row — with a dispatch-time snapshot of why the vendor matched.

## Completed Deliverables
- Schema for **7 tables** in migration `0009_brief_wallflower` (InnoDB/utf8mb4, UUID v7 PKs): `dispatch_assignment_statuses` (GLOBAL ref, 9 statuses) + 6 operational (`job_vendor_assignments`, `job_vendor_assignment_status_history`, `dispatch_messages`, `vendor_eta_confirmations`, `vendor_check_ins`, `vendor_check_outs`).
- **`findCandidateVendorsForJob`** (5a) — the cross-vendor matching query (trade + geo + compliance eligibility, ranked primary-trade → tightest-geo → name) with a dispatch-time facet snapshot.
- **`createDispatch`** (single-entity, 3-write txn → DRAFT, server-re-derived facet snapshot) and **`sendDispatch`** (dual-entity txn, parent-before-child `FOR UPDATE` locks → SENT + job advance).
- Screens: the dispatch section on `/jobs/[id]`, the matcher-driven `/jobs/[id]/dispatch/new`, the `/jobs/[id]/dispatch/[assignmentId]` workspace with Send.
- The first job status transition (NEW/SCHEDULED → DISPATCHED) and the first non-creation event (`job.dispatched`).
- All 11 Phase 5 docs.

## Files Created or Changed
- Schema: `src/server/schema/dispatch-reference.ts`, `dispatch-assignments.ts`, `dispatch-comms.ts`, `dispatch-presence.ts`; updated `index.ts`.
- Migration: `db/migrations/0009_brief_wallflower.sql` (+ meta).
- Data layer: `src/server/vendor-matching.ts`, `dispatch.ts`, `dispatch-reference.ts`; additions to `vendor-contacts.ts` (`getVendorContact`), `vendor-trade-coverage.ts` (`branchCoversTrade`), `jobs.ts` (`getJobDetail` + `approvedScopeOfWork`).
- Actions: `src/app/(app)/jobs/[id]/dispatch/new/actions.ts`, `.../[assignmentId]/actions.ts`.
- UI: `.../dispatch/new/page.tsx`, `.../dispatch/[assignmentId]/page.tsx`, dispatch section in `.../jobs/[id]/page.tsx`; `src/components/new-dispatch-form.tsx`, `send-dispatch-button.tsx`, `dispatch-status-badge.tsx`, `dispatch-facets.ts`.
- Seeds/tooling: `db/seeds/dispatch-reference.ts`; `db:seed:dispatch-reference` script.
- Docs: `docs/phase-5-dispatch/01..11`.

## Database Changes
See `08-db-changes.md`. 7 new tables in 1 migration (6 operational + 1 global ref); `dispatch_assignment_statuses` global, the rest tenant-scoped; assignment reference FKs RESTRICT, the 5 child→assignment + assignment→job FKs CASCADE, `vendor_contact_id`/`*_user_id` SET NULL; no `(job_id, vendor_id)` uniqueness; short explicit FK names (`jva_`/`jvash_`/`dm_`/`vec_`/`vci_`/`vco_`) to stay under 64 chars; `matched_geo_types_at_dispatch` is `json` (stored `longtext` + `json_valid` CHECK on MariaDB). Total recorded migrations: **10**.

## API Routes / Server Actions Added
See `09-api-routes.md`. 2 new pages + a dispatch section on the job detail; 2 server actions (`createDispatchAction`, `sendDispatchAction`); data-layer modules `vendor-matching.ts`, `dispatch.ts`, `dispatch-reference.ts` (+ `getVendorContact`, `branchCoversTrade`, `getJobDetail.approvedScopeOfWork`).

## User-Facing Workflows Added
See `03-user-sop.md`, `05-system-workflows.md`: view a job's dispatches; dispatch a vendor (matcher-candidate picker + pre-filled form); send a dispatch (DRAFT → SENT, job → Dispatched); read the immutable match snapshot.

## Admin/Internal Workflows Added
Seed the 9 global dispatch statuses; apply migration 0009; verify the dispatch FK delete rules + the JSON column representation; inspect the worked examples; the ephemeral-script + mutate-restore verification discipline (`04-admin-sop.md`).

## Business Rules Added
See `06-business-rules.md` R-5.1…R-5.16: advisory matching (R-5.1), equality-geo + non-blocking-compliance + ranking (R-5.2), draft-then-send (R-5.3), createDispatch/sendDispatch split (R-5.4), job_events = milestone-not-action-log (R-5.5), domain-verb events (R-5.6), parent-before-child lock order (R-5.7), explicit-workflow-transitions (R-5.8), dispatchable-vs-advance sets (R-5.9), primary-trade-not-primary-vendor (R-5.10), pre-fill discipline (R-5.11), dispatch_scope immutable snapshot (R-5.12), semantic status colors (R-5.13), 10-step sort_order (R-5.14), dispatch_messages content-only / Phase 5-6 boundary (R-5.15), declined-vs-cancelled + two check tables (R-5.16).

## Chatbot Knowledge Added
See `07-chatbot-knowledge.md`: the 7-table map, the 9 statuses, the matcher + deferred-signals story, the facet snapshot, draft-then-send + the §2.9 forward-compat note, the dual-entity transaction, the "Primary" precision section, the Job #1 (no-candidate) + Job #2 (dispatched) worked examples, the audit/event vocabularies, and the "do not claim" list.

## Verification Performed
```bash
pnpm lint         # clean
npx tsc --noEmit  # exit 0
pnpm build        # clean; /jobs/[id]/dispatch/new + /[assignmentId] routes resolve, RSC/client boundaries OK
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 10
mysql ... -e "SELECT COUNT(*) FROM dispatch_assignment_statuses;"   # 9
# 5b: 6 verification blocks — migration count, 9 seed rows in sort order, FK delete rules
#     (5 child→assignment CASCADE, assignment→ref RESTRICT), JSON longtext+json_valid CHECK, facet enums, direction enum.
# 5a: matcher smoke (5 cases) + index-driven EXPLAIN (no temporary/filesort). [scratch scripts deleted]
# 5c: createDispatch/sendDispatch smoke (all 6 steps green) — Job #2 (HVAC) dispatched to Sunbelt
#     (vendor-wide, SENT, job NEW→DISPATCHED); branchCoversTrade true/false; re-dispatch no-op
#     (event fires, no status regress); VENDOR_NO_LONGER_CANDIDATE (archive→test→restore w/ verify);
#     chosen_branch=false. [scratch script deleted]
# 5d: data-orchestration probe (candidate query, enrichment, dispatch section, assignment detail
#     against live Job #1/#2) + manual browser click-through (create→send on a throwaway Job #3,
#     then teardown to the locked keeper). [scratch scripts deleted]
# Keeper: Job #1 (Plumbing/NYC/New, no candidate) + Job #2 (HVAC/NYC/Dispatched, 1 SENT assignment),
#         next_number=3; Sunbelt HVAC coverage active.
```

## Known Limitations
See `10-known-limitations.md` L-5.1…L-5.14. Highlights: no aggregator-designated primary vendor / auto-dispatch (L-5.1); `dispatch_messages` no recipient/delivery fields (L-5.2); ETA/check-in/messages schema-only, no UI (L-5.3); radius/county inert (L-5.4); compliance non-blocking sunset (L-5.5); no perf/proximity ranking (L-5.6); matcher correlated subqueries (L-5.7); MariaDB JSON-as-longtext (L-5.9); no edit/accept/decline UI (L-5.10); ON_HOLD not auto-lifted (L-5.11).

## Carry-Forward Items
- **Phase 6:** the `dispatch_messages` delivery layer (recipient routing + `delivered_at`/`read_at`); the ETA / check-in/out / messages UI on the Phase 5 schema; the note-visibility/communication workflows (the `visibility` column exists from Phase 4 + on `dispatch_messages`).
- **Phase 6+/9:** aggregator-designated primary vendor + auto-dispatch routing.
- **Sunset triggers:** radius matching (coordinates), county matching (county column), compliance hard-gating (compliance data).
- **Phase 9:** performance scores + proximity ranking; possible matcher JOIN-GROUP-BY rewrite + dispatch analytics indexes.
- **Phase 10:** vendor-side accept/decline (assignment transitions beyond Send).
- **Phase 8:** change orders for editing a sent dispatch's scope/NTE.

## Recommended Next Phase Focus
**Phase 6 — Notes, Communication, and Update Engine** (`v0.7.0-phase-6`). The Phase 2–5 patterns hold (tenant-scoped tables, create/read screens, parent-in-tenant guards, the audit-rule split, the InnoDB + identifier guards). Orient on what Phase 6 **inherits** vs what's **genuinely new**:

- **Inherits from Phase 5:** the **parent-before-child lock order** (R-5.7) for its review-and-publish workflows; the **explicit-workflow-transitions rule** (R-5.8 — note publication must not silently advance job status); the **`dispatch_messages` content table** to extend with the recipient + delivery layer (R-5.15 — the boundary is already drawn); the **`visibility` column** established on `job_notes` (Phase 4 D-4.10) and `dispatch_messages` (Phase 5); the **`job_events` milestone-timeline discipline** (R-5.5) as it builds the rich timeline UI; and the **§2.9 agent-under-policy** posture (the Phase 6 vendor→client update rewriter agent must remain draft-and-review, mirroring draft-then-send).
- **Genuinely new in Phase 6:** the **inbound** message path (Phase 5 has `direction` but only outbound, and no message UI at all); the **delivery layer** (send/bounce/read, recipient routing, channel selection); the **rich event timeline UI** consuming `job_events` (Phase 4/5 render plain lists); and the **visibility-control workflow** that Phase 4/5 have only the schema for (the picker + the vendor/client-sharing rules).
- **Reuse** the dependent-picker pattern (R-4.12), the pre-fill discipline (R-5.11), the semantic status-color palette (R-5.13), and the generalized `ContactForm`/`ContactList` for any new contact surface.
