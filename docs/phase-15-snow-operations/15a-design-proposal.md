# Phase 15 — Snow Operations · 15a Design Proposal (FORKS, ALL OPEN)

> Every fork below is **OPEN / UNRESOLVED pending Jonny**. 15a inspects and
> recommends; it does NOT decide. Recommendations are starting positions for the
> 15b design lock, each grounded in a live 15a finding. Nothing here is built.

---

## Phase 15 character

Snow Operations is the **second "software within a software"**: an
**EVENT-triggered batch engine**, structurally parallel to Phase 14's PM
**time-triggered** batch engine.

| Axis | PM (Phase 14) | Snow (Phase 15) |
|---|---|---|
| Trigger | time / recurrence (`next_due_at <= now`) | **event** (a storm is declared) |
| Fan-out target | `pm_schedule_locations` (schedule→location) | **`snow_event_sites`** (event→site) |
| Per-item spawn | `createJob(source='preventative_maintenance')` | `createJob(source='snow_event')` |
| Batch-run record | `pm_generation_runs` | a storm/dispatch-run analog |
| Recurrence advance | `advanceDueDate` once per run | **N/A** — an event fires once, doesn't recur |
| Failure isolation | per-location skip-and-flag, no outer txn (IF-4) | same, at **storm scale** |
| Human gate (§2.5) | auto vs review (`approvePmVisits`) | auto-dispatch vs operator batch-confirm |

The PM engine (`src/server/pm/`) is the template to **adapt, not duplicate**. The
key structural difference: PM advances a clock; Snow reacts to a one-shot event.
`recurrence.ts` therefore has no direct snow counterpart, and the "due-schedule
scan" entrypoint becomes an "event-declaration" entrypoint.

---

## F15-A — Event-batch trigger mode

**Options:** (1) declaring a snow event **AUTO-dispatches** all enrolled sites
immediately; (2) declaring an event **STAGES** dispatches for an operator
**batch-confirm** before they go out.

**Trade-off:** Auto is fastest at storm onset (no human in the critical path) but
removes the §2.5 review gate; staged keeps operator control but adds latency when
speed matters most (a storm is time-critical, unlike a routine PM).

**Live finding:** This is PM's F1 (auto vs review) re-opening in event form. PM
implements it as a per-program `auto_generate` flag selecting `mode` in
`run-due-schedules.ts:47`, with `approvePmVisits` as the review path. The mechanism
exists and adapts directly.

**RECOMMENDATION (OPEN):** Build **both modes** behind a program/event-level flag,
exactly as PM does — `mode: "auto" | "review"`. Snow's bias may differ (storms favor
auto), but build the gate and let the flag decide per program. Mirror
`generateVisitsForSchedule`'s `opts.mode` branch.

---

## F15-B — `snow_sites`: new entity vs overlay on `client_locations`

**Options:** (1) a standalone `snow_sites` table; (2) a snow **overlay/membership**
keyed to `client_location_id` (the `pm_schedule_locations` analog), carrying
snow-specific attributes.

**Trade-off:** A standalone table duplicates address/geo already in
`client_locations` and risks drift; an overlay reuses the canonical site record and
adds only snow attributes (surface type, lot size, service tier, salt/plow spec).

**Live finding (Survey 3):** `client_locations` already holds full address +
`latitude`/`longitude` (decimal(10,7)). `pm_schedule_locations` is a 6-col membership
join (`pm_schedule_id`, `client_location_id`, `is_active`) — the proven overlay
pattern.

**RECOMMENDATION (OPEN):** **Overlay** — a `snow_event_sites` (or
`snow_program_sites`) membership referencing `client_location_id`, plus snow-specific
attribute columns. Do not duplicate the location entity. Mirror
`pm_schedule_locations`.

---

## F15-C — `snow_dispatches` vs reusing `job_vendor_assignments`

**Options:** (1) a new `snow_dispatches` object; (2) each enrolled site spawns a
**job** (`source_type='snow_event'`) that flows through the **existing** Phase 5
dispatch workflow (`job_vendor_assignments` + `dispatch_messages`).

**Trade-off:** A new object means rebuilding vendor matching, status, comms, NTE
snapshotting — all of which Phase 5 already solved. Reuse keeps one dispatch substrate
(source-agnostic, per the hard rules) but inherits the reactive per-job shape (one
job per site, dispatched individually).

**Live finding (Survey 3):** `job_vendor_assignments.job_id` is NOT NULL and the
full match/comms/NTE/status machinery hangs off a job. A snow job reuses it verbatim.
"dispatch" is also heavily load-bearing (~40 files) — a `snow_dispatch` name would
collide conceptually (WP-15.1).

**RECOMMENDATION (OPEN):** **Reuse.** A `snow_event_site` spawns a `createJob(...,
sourceType:'snow_event')`, and that job uses the EXISTING dispatch workflow. No new
dispatch object. Keeps the app source-agnostic and avoids the naming collision.
(Couples with F15-E.)

---

## F15-D — Trigger-rule model

**Options:** (1) **manual operator declaration** ("a storm hit, fire the program");
(2) a **weather-threshold rule** (snowfall/depth crosses a threshold → auto-fire).

**Trade-off:** Manual is buildable now and needs no external feed; threshold rules
need a live weather feed + eval engine that the roadmap explicitly defers.

**Live finding (Survey 7):** **Zero** weather/snowfall/snow_depth plumbing in `src/`.
The roadmap caps live weather as deferred regardless.

**RECOMMENDATION (OPEN):** Build **manual/triggered fire** (an operator or harness
declares the event). Model the trigger so a future threshold rule can fire the SAME
entrypoint (the generator-not-cron precedent: `runDueSchedules` is harness-invokable,
live cron deferred). **Defer live weather eval** entirely in Phase 15.

---

## F15-E — Fan-out chain shape

**Options:** (1) `event → N event_sites → N dispatches → N jobs` (a distinct dispatch
layer between site and job); (2) `event → N event_sites`, each **spawning a job
directly** (`source_type='snow_event'`), which then dispatches via the existing flow.

**Trade-off:** A separate dispatch layer adds an object to maintain; direct
job-spawn keeps the chain short and reuses Phase 5 dispatch unchanged.

**Live finding:** PM's chain is `schedule → N schedule_locations → N visits → N jobs`
(`generate-visits.ts`). The `visit` is a meaningful PM artifact (a scheduled service
occurrence). Snow's equivalent question: is `event_site` enough, or is a separate
"dispatch" artifact needed? Survey 3 shows `job_vendor_assignments` already IS the
dispatch artifact, downstream of the job.

**RECOMMENDATION (OPEN):** `event → N event_sites → N jobs (source='snow_event')`,
each job dispatching through the existing `job_vendor_assignments` flow. The
`event_site` row is the snow analog of `pm_visits` (the per-site batch artifact that
links to its spawned job). No extra `snow_dispatches` layer. (Couples with F15-C.)

---

## F15-F — `snow_service_logs`: template-vs-instance (CF-14.1 analog)

**Options:** (1) per-dispatch service-capture **instances** only; (2) instances
**instantiated from a program-level service definition/template** (what gets done at
a site during a storm: plow, salt, sidewalk, hauling).

**Trade-off:** Instance-only is simpler but re-enters scope each storm; a
template→instance split (the PM checklist pattern, CF-14.1) lets a program define the
service spec once and each dispatch capture against it.

**Live finding:** This is the direct analog of Phase 14's
`pm_visit_checklists`/`pm_visit_results` (commit `25f9f15`: template schema vs
per-visit results). That split already shipped for PM — a proven precedent.

**RECOMMENDATION (OPEN):** Mirror the PM checklist split — a program-level snow
**service definition** (template) and per-dispatch **results** (instance). But this
may be a *deferred* sub-batch within Phase 15 (capture can follow the dispatch engine).
Flag scope: confirm whether service-logs are in 15's engine scope or a later batch.

---

## F15-G — Per-site failure isolation + the batch-run record

**Options:** (1) the `snow_event` row itself IS the batch-run record (counts on the
event); (2) a **separate dispatch-run row** per fire (the `pm_generation_runs`
analog), so re-firing an event opens a new run.

**Trade-off:** Counts-on-event is simpler but conflates "the storm" with "this fan-out
attempt" — a re-fire (e.g. a second wave, or a retry after partial failure) has
nowhere clean to record its own requested/generated/skipped. A separate run row
preserves the PM idempotency/re-fire story.

**Live finding (Survey 4):** PM uses a dedicated `pm_generation_runs` (requested/
generated/skipped/run_at) and the fan-out is deliberately NOT one txn — per-item
skip-and-flag (`generate-visits.ts:172`). Skip-and-flag at storm scale (N sites) is
the same mechanism, just larger N.

**RECOMMENDATION (OPEN):** **Separate run row** (`snow_dispatch_runs` or
`snow_event_runs`), the `pm_generation_runs` analog, with per-site skip-and-flag and
no outer txn (IF-4 confirmed in Survey 5: `createJob` owns its txn). The `snow_event`
holds the storm; the run row holds one fan-out attempt's counts. Supports re-fire.

---

## F15-H — Engine-vs-UI scope boundary (B-14.4 analog)

**Options:** where is the Phase 15 line? (1) Phase 15 = the event-driven
**batch-dispatch ENGINE** (server modules + harness, no operator UI); (2) include a
mass-operation UI.

**Trade-off:** PM Phase 14 drew the line at the engine and deferred the mass-op UI to
the operator portal (B-14.4). Keeping the same line keeps Phase 15 focused and avoids
building portal surface ahead of its phase.

**Live finding (Survey 4):** PM shipped `run-due-schedules.ts` as the
harness-invokable trigger with the **live cron deferred** (B-14.2) and no bespoke UI.
Same precedent applies.

**RECOMMENDATION (OPEN):** Phase 15 = the **engine** (event declaration → fan-out →
per-site job spawn → existing dispatch), harness-driven, with a `check-snow-*`
harness analog to Phase 14's `check-pm-generation`. **Mass-op / operator UI defers**
to the operator-portal phase (B-14.4 analog). Confirm this line at 15b.

---

## F15-I — Fixture: seed `snow_sites` distinctly vs reuse `client_locations`

**Options:** (1) seed dedicated snow sites for the harness storm; (2) reuse the
existing sandbox `client_locations` as the fan-out targets.

**Trade-off:** Distinct seeds isolate the snow harness but add fixture maintenance;
reuse exercises the real overlay path (F15-B) against canonical locations.

**Live finding (Survey 6):** Sandbox `client_locations`: Acme **4**, Globex **2**,
Umbrella 1, Initech 1. Acme's 4 sites are enough to demonstrate multi-site fan-out
immediately; Globex's 2 gives a secondary fan-out.

**RECOMMENDATION (OPEN):** **Reuse `client_locations`** — enroll Acme's 4 sandbox
locations into a snow program/event as the harness storm fan-out (and exercises the
F15-B overlay against real rows). Only seed distinct snow attributes (the overlay
columns), not new location entities. Consistent with F15-B's overlay recommendation.

---

## Cross-fork coherence note

F15-B (overlay), F15-C (reuse dispatch), F15-E (direct job spawn), F15-G (separate
run row), F15-H (engine-only), and F15-I (reuse locations) form one coherent
"adapt-the-PM-engine, reuse-Phase-5-dispatch, stay source-agnostic" posture. F15-A
(trigger mode) and F15-D (manual fire) are the genuinely event-specific deltas from
PM. F15-F (service logs) is the one fork that may push to a later sub-batch. All
remain Jonny's to lock at 15b.
