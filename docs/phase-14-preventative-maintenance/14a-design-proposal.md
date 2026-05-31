# Phase 14 — Preventative Maintenance — 14a Design Proposal

**Status: PROPOSAL + OPEN FORKS — nothing decided.** Grounded in the 14a inspection (live truth). Forks F1–F7 are for Jonny to resolve at 14b; each carries options, stakes, and a marked-OPEN recommendation.

## The shape (candidate architecture)
PM is a fan-out engine: **program → schedule → (recurrence × locations) → batch of visits → jobs.** Candidate table roles (the roadmap's 7, mapped to Phase-12/13 precedents):

| Table | Role | Precedent analog |
|---|---|---|
| `pm_programs` | the named PM program (a tenant's "Quarterly HVAC PM") — the top of the fan-out | `email_ingestion_accounts` (config root) |
| `pm_schedules` | the recurrence definition (how often visits recur) ⚠ name vs dispatch "scheduled_start" | greenfield (no recurrence precedent) |
| `pm_schedule_locations` | the fan-out join: which `client_locations` a schedule covers | many-to-many |
| `pm_assets` | the equipment a visit services (optional per visit) | `client_locations` (tenant-scoped entity) |
| `pm_visits` | one scheduled occurrence at one location (the batch unit) | `email_work_order_drafts` (the reviewable/generated unit) |
| `pm_visit_checklists` | the checklist TEMPLATE attached to a visit type | template |
| `pm_visit_results` | the per-item completion record (instance) | `email_parse_results` (per-item record) |

Batch generation mirrors the email draft→job pattern (Survey 3): a **shared per-visit helper** (readiness + `createJob` @ NEW, `source_type='preventative_maintenance'`) called in a fan-out loop, with the human/auto gate as the outer policy.

---

## OPEN FORKS (Jonny decides at 14b)

### F1 — Batch generation model
- **(a) draft-then-approve** (record-don't-apply; the email precedent at scale): generate `pm_visits` as drafts, operator approves → jobs.
- **(b) auto-create-by-default**: a schedule firing on its due date is *deterministic* (unlike an ambiguous email), so generate jobs directly.
- *Stakes:* §2.5 (AI/automation = reviewable draft) was about *parsing ambiguity*; a schedule has none. But mass auto-creation is high-blast-radius.
- **Recommendation (OPEN):** **hybrid** — generate `pm_visits` deterministically (they're certain), but make the **visit→job** step the gate: auto-create for "trusted" programs, draft-then-approve otherwise (reuses the CF-13.1 seam shape). Lets F1 be a per-program flag, not a global decision.

### F2 — Per-item failure isolation
- **(a) abort-all** (one location fails → whole batch rolls back) vs **(b) skip-and-flag** (failed location recorded, batch continues).
- *Stakes:* a 200-location program where location #147 has a bad client_location FK shouldn't lose the other 199.
- **Recommendation (OPEN):** **skip-and-flag** — each visit/job is its own txn (createJob already is); a per-item failure flags that visit and continues, with a generation-run summary (mirrors the email per-item discipline + the IF-4/CF-13.6 "audit-don't-throw" stance).

### F3 — Mass-op scope (Phase-14 ENGINE vs deferred UI vs operator-portal)
- Candidate mass ops: batch **create** (generate visits/jobs), batch **status** change, batch **update**, batch **dispatch**.
- **Recommendation (OPEN):** Phase-14 ENGINE = batch **create/generate** (the core fan-out) + the data layer for batch **status**; **defer** batch dispatch + the mass-op UI to the operator-portal phase (the Phase-12/13 "framework not UI" precedent). Surface exactly which ops are in-scope at 14b.

### F4 — Recurrence model (GREENFIELD — Survey 6: no lib, no utility)
- **(a) cron-like** (string expression) · **(b) interval** (every N days/weeks/months) · **(c) calendar** (specific months/days).
- *Stakes:* "next due" computation + storage; whether to add a dep (`rrule`/`date-fns`) or hand-roll interval math (the project has NO date lib and a no-UI-deps lean).
- **Trigger:** a **harness-invokable generator** (compute due → generate), **defer the live cron** (mirrors P12 deferred fetch / P13 deferred receiver) → bank as a CF.
- **Recommendation (OPEN):** **interval model** (every N days/weeks/months/quarters) — covers most facilities PM, needs no rrule dep, hand-rollable; store `next_due_at` + the interval spec. Cron/calendar deferred unless a real program needs it.

### F5 — pm_visits ↔ jobs relationship (roadmap lists BOTH — resolve explicitly)
- **(a) a visit IS a job** (`jobs` row, `source_type='preventative_maintenance'`) vs **(b) a visit is a separate `pm_visits` record that SPAWNS a job** on generation/approval.
- *Stakes:* (a) is simpler but loses the "scheduled-but-not-yet-a-job" state + the recurring-occurrence identity; (b) gives a clean PM lifecycle (planned → due → generated → job) and a stable visit history independent of the job.
- **Recommendation (OPEN):** **(b) separate record that spawns a job** — `pm_visits` holds the occurrence (planned/due/generated/skipped) and links to a `created_job_id` when generated (the `email_work_order_drafts.created_job_id` precedent exactly). Preserves the fan-out audit + makes F1/F2 clean.

### F6 — Checklist template-vs-instance
- `pm_visit_checklists` (template attached to a program/visit-type) → `pm_visit_results` (per-visit instance of completed items).
- **Recommendation (OPEN):** **template→instance** — the template lives on the program/schedule; on visit generation, instantiate result rows (or instantiate lazily at execution). Mirrors `scope_templates → job_scope_steps` (Phase 7). Confirm whether results instantiate at generation or at visit-execution time.

### F7 — Fixture (does the PM harness need MULTIPLE seeded locations?)
- The fan-out is the whole point, so the harness MUST exercise one-program → many-locations.
- *Finding:* the seed already gives **Acme = 4 locations** (Survey 4) → sufficient for a fan-out assertion without new seed data.
- **Recommendation (OPEN):** reuse Acme's 4 locations for the fan-out assertion (program over 4 locations → 4 visits → 4 jobs), + build any extra in-harness (the Phase-12/13 self-fixture pattern). No seed change needed; bank FB if a dedicated multi-location PM fixture is wanted later.

---

## Inherited discipline (carries in, not re-litigated)
- §2.1 source-agnostic (PM is a source channel); §2.5 (auto-output reviewable where ambiguous); every workflow gets an event/history row (CLAUDE.md §6).
- WP-12.1 (name the DB), WP-12.2 (pre-name FKs — `pm_*` names + 7 tables will need it), MariaDB-JSON parse-at-read (if any json columns), WP-13.2 (clear stale tsbuildinfo before tsc verdicts), §10 (read verdicts from file).
- Migration cadence (0036+): drizzle entry → generate → SQL inspect (HALT) → sandbox apply → contract-verify `-E` → HALT for prod confirm → prod apply → 4-file commit.
- **⚠ Naming care (Survey 2):** `pm_schedules` (recurrence) vs the existing dispatch `scheduled_start` / `SCHEDULED` status — keep PM names unambiguous.

## Owed before 14b locks schema
Resolve F1–F7. The recurrence model (F4) + the visit↔job relationship (F5) are the two load-bearing ones — they shape the whole table set. Everything else (table columns, FK delete-rules, the manifest) follows from those two.
