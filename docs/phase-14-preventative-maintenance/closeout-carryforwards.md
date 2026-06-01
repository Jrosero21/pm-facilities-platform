# Phase 14 — Carry-Forwards

The canonical home for every banked item. Discharged items recorded as verified; open items roll forward with an id.

## Discharged this phase (verified — NOT carry-forward)
| Item | Evidence |
|---|---|
| Fan-out width = live membership | harness A1/A3, green @ `a149c22` |
| PM job attribution (source_type / system-auto / operator-review / NEW) | harness B1–B4, E4 |
| Interval recurrence advance + idempotent re-fire | harness C1–C3 |
| Skip-and-flag batch isolation (one failure ≠ abort) | harness D1–D4 |
| Review gate (no jobs until approve) + re-call guard | harness E1–E3, E5 |
| Tenant isolation (cross-tenant → SCHEDULE_NOT_FOUND) | harness F1 |
| Empty fire auditable, no throw | harness G1 |
| CF-13.1 shared-helper-autonomy-seam pattern APPLIED (inner generator both paths call) | generate-visits.ts + approve-visits.ts |

## New Phase-14 banked items (open)
| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **B-14.1** | **PM Programs UI placement** — a dedicated "PM Programs" section as primary home + a read-only list on the client profile. | The React surfaces. | UI decision → operator-portal phase, not Phase-14 schema. |
| **B-14.2** | **Live cron / scheduler trigger** — a timer that calls `runDueSchedules` periodically. | The scheduler/transport. | `runDueSchedules` is the triggered entry; the timer is the activation work (P12/P13 deferred-live precedent). |
| **B-14.3** | **Per-location scope/trade override** — a member location overriding the program's trade/scope. | A per-membership override column + resolution. | Schema room left; the canonical example needs one trade across all stores. |
| **B-14.4** | **Mass-dispatch + generic mass-update UI** — batch operations beyond generate. | Action wrappers + screens. | Operator-portal phase. |
| **B-14.5** | **`pm_assets` lightweight cap** — it is a name/type/location reference, NOT EAM asset-lifecycle. | (None — an explicit scope cap.) | Enterprise asset depth out of scope. |
| **CF-14.1** | **Checklist result instantiation** — the engine does not yet create `pm_visit_results` per visit from the program's `pm_visit_checklists` template. | A per-visit instantiation step (at generation or at execution time). | Drops in with the PM execution / mobile work surface (a future "mobile work execution" lesson). |
| **CF-14.2** | **Operator authz gate on `approvePmVisits`** — the data-layer fn exists; the `requireTenant`/`requireRole` wrapper + friendly-error surface are not built. | The action wrapper. | Operator-portal phase (the CF-13.7 analog). |
| **CF-14.3** | **PM program/schedule CRUD UI** — programs/schedules/membership are harness-seeded; no operator create/edit UI. | The CRUD screens + actions. | Operator-portal phase. |

**NOTE (package management):** `date-fns@4.4.0` was added via **pnpm** (`pnpm add` / `pnpm-lock.yaml`). **This repo is pnpm, not npm** — an `npm install` crashes npm's arborist against the pnpm `node_modules` and mutates nothing. Use `pnpm` for all future package specs.

## Inherited (roll forward, UNCHANGED — from the Phase-13 bank)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — the shared-helper seam PATTERN was applied in Phase 14, but the email autonomy item itself stays open (gated on accumulated review-confirm data + §2.5 relaxation) |
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
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–14) |
| FB-10a.1/.3 | Operator vendor/client-updates inbox + invite/onboarding flow |
| FB-10l.2/.3 | Visibility-promotion workflow; `requires_review` undefined |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`) |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture |

## Standing watchpoints (next phase)
- **Naming care** — `pm_schedules` (recurrence) ≠ the dispatch adjective "scheduled" (`scheduled_start_at`/`scheduled_end_at`); recurrence cols are `frequency`/`interval_count`/`next_due_at`/`last_generated_at`.
- **pnpm not npm** (above).
- **Inherited:** WP-13.1 (`inbound_emails` ≠ `inbound_messages`), WP-13.2 (stale `tsconfig.tsbuildinfo` → phantom tsc errors, `rm` it), WP-12.1 (name the DB), WP-12.2 (pre-name FKs — long `pm_*` names exceed 64 chars), MariaDB-JSON parse-at-read, §10 (read verdicts from file + true exit).
- **Standing (earlier phases):** `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only; better-auth NULL-tenant audit rows.

## Recommended next-phase focus
**Phase 15 — Snow** (roadmap; `snow_event` already a live `jobs.source_type`). Same batch/event-driven shape as PM — a weather event fans out over a client's serviced locations → a batch of jobs — building directly on this phase's fan-out + skip-and-flag + batch-event substrate.
