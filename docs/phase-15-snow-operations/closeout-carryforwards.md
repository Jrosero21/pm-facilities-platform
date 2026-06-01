# Phase 15 — Carry-Forwards

The canonical home for every banked item. Discharged items recorded as verified; open items roll forward with an id.

## Discharged this phase (verified — NOT carry-forward)

| Item | Evidence |
|---|---|
| Materialize-at-declare: fan-out width = live membership | harness A1/A3/A4, green @ `6e0c8ba` |
| Stage gate (no spawn until confirm) | harness B1–B3 |
| Auto-dispatch path (declare spawns in one call) | harness C1–C3 |
| Snow job attribution (source_type=snow_event / source_external_id=eventId / NEW / operator-or-declarer) | harness B4, C3 |
| Skip-and-flag batch isolation (one poison site ≠ abort; event still completes) | harness D1–D4 |
| Idempotent re-fire + status-guarded link-back (no double-spawn) | harness E1–E3 |
| Tenant isolation (cross-tenant → SNOW_PROGRAM_NOT_FOUND) | harness F1–F2 |
| Empty fire completes cleanly, no throw | harness G1 |
| CF-13.1 shared-helper-autonomy-seam pattern APPLIED (inner `dispatchSnowEventSites` both paths call) | declare-event.ts + confirm-dispatches.ts |
| Decision-A weather-FK (`fk_sevent_weather`) completed | 0041 prod FK matrix (SET NULL) |

## New Phase-15 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **B-15.1** | **Snow service-log capture RUNTIME** — fill `snow_service_logs` (serviced_at, photo_refs, gps, notes) per dispatch. | The capture flow (mobile/field execution surface). | Schema lands 0041; capture is the execution/mobile lesson (CF-14.1 analog). |
| **B-15.2** | **Live weather feed + auto-event-trigger** — evaluate `snow_service_triggers` against real observations to auto-declare. | The weather feed + the threshold evaluator (calls the same `declareSnowEvent`/workhorse seam). | Manual fire built; live weather eval defers (B-14.2 analog). |
| **B-15.3** | **Mass-op operator UI + snow operator screens** — program CRUD, the declare/confirm surface, batch operations, + the `requireTenant`/`requireRole` action wrappers. | The React surfaces + action layer. | Engine is Phase 15; UI defers to operator-portal (B-14.4 analog). |
| **B-15.4** | **Snow dashboard read surface** — a thin read over events/dispatches (counts, status, per-site outcome). | The read query layer + screen. | Roadmap deliverable; read surface defers with the UI phase. |
| **CF-15.1** | **`spawned_count`/`skipped_count` columns on `snow_events`** — batch totals currently live in `snow_event.dispatched` audit metadata only. | A schema add + engine write, if a read surface needs queryable counts. | Audit metadata sufficed for the engine; columns add only when a reader needs them. |

**NOTE (package management):** this repo is **pnpm, not npm** — use `pnpm` for all package specs (an `npm install` crashes npm's arborist against the pnpm `node_modules`). Carried from Phase 14.

## Inherited (roll forward, UNCHANGED — from the Phase-14 bank)

| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — the shared-helper seam PATTERN was applied again in Phase 15, but the email autonomy item itself stays open (gated on accumulated review-confirm data + §2.5 relaxation) |
| CF-13.2 | Live email receiver (IMAP/webhook/mailbox polling) |
| CF-13.3 | Real deterministic + AI email extractor logic |
| CF-13.4 | Email attachment physical-storage backend |
| CF-13.5 | Email→client resolution column (`external_system_id` on `email_ingestion_accounts`) |
| CF-13.6 | Email approve→link orphan window (source_external_id reader guard) |
| CF-13.7 | Operator email review-queue UI (+ AI-assist invocation surface) |
| CF-12.1 | Full-workflow auto-push (job change → mapped external platform) |
| CF-12.2 | Live external adapter (real fetch/push HTTP) |
| CF-12.3 | Operator mapping UIs (external_*_mappings management) |
| CF-12.4 | Credential encryption-at-rest |
| CF-12.5 | External-ingest IF-4 orphan window |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–15) |
| FB-10a.1/.3 | Operator vendor/client-updates inbox + invite/onboarding flow |
| FB-10l.2/.3 | Visibility-promotion workflow; `requires_review` undefined |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`) |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture |

### Inherited Phase-14 banked items (still open — roll forward)
| Id | Item |
|---|---|
| B-14.1 | PM Programs UI placement (dedicated section + client-profile read list) |
| B-14.2 | Live cron / scheduler trigger (timer calling `runDueSchedules`) |
| B-14.3 | Per-location scope/trade override on a PM membership |
| B-14.4 | Mass-dispatch + generic mass-update UI (operator-portal) |
| B-14.5 | `pm_assets` lightweight cap (explicit scope cap, not EAM) |
| CF-14.1 | PM checklist result instantiation (`pm_visit_results` per visit from the template) |
| CF-14.2 | Operator authz gate on `approvePmVisits` (action wrapper) |
| CF-14.3 | PM program/schedule CRUD UI |

## Standing watchpoints (next phase)

- **Snow naming care** — `snow_events` (the storm batch header) ≠ `job_events` (the per-job timeline); `snow_dispatches` (per-site spawn/outcome) is NOT a vendor-assignment table (the spawned job uses the existing `job_vendor_assignments` dispatch).
- **id-guard is not a pnpm alias** — runs in `db:generate` / `node scripts/check-migration-identifiers.mjs`.
- **drizzle forward-FK ordering** — a table referenced by an earlier-declared table's FK must be declared before it (eager `foreignKey()` callback); see the `fk_sevent_weather` note.
- **Inherited:** WP-13.1 (`inbound_emails` ≠ `inbound_messages`), WP-13.2 (stale `tsconfig.tsbuildinfo` → phantom tsc errors, `rm` it), WP-12.1 (name the DB explicitly), WP-12.2 (pre-name FKs — long names exceed 64 chars), MariaDB-JSON parse-at-read, §10 (read verdicts from file + true exit), **pnpm not npm**.
- **Standing (earlier phases):** `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only; better-auth NULL-tenant audit rows.

## Recommended next-phase focus

**Phase 16 — the assistant / chatbot** (roadmap). Snow + PM + reactive jobs now share one job model + a documented knowledge surface (each phase's `07-chatbot-knowledge.md`); the assistant grounds on those. Alternatively the **operator-portal** phase discharges the accumulated UI bank (B-14.1/.3/.4, CF-14.2/.3, B-15.3/.4).
