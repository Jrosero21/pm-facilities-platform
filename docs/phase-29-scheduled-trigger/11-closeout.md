# Phase 29 Closeout — Scheduled Trigger

## Phase Goal
Build the **unattended-trigger mechanism** for autonomous re-dispatch — the piece Phase 28 named as
its single load-bearing deferral (*"the one deferral that makes several others moot until it lands"*).
Phase 28's autonomy was operator-*button*-triggered; a human started every autonomous action. Phase 29
makes the engine callable by something that is not a person, with the guardrails an unattended caller
requires proven **before** any timer exists.

## Completed Deliverables
- **Session-free sweep core** — `runAutoRedispatchSweep` (`src/server/auto-redispatch-sweep.ts`). The
  operator button's loop body extracted **verbatim**, so button and trigger run identical code —
  including the `can_suggest` stuck-filter, which T1 does not have.
- **Per-job cooldown** — `REDISPATCH_COOLDOWN_HOURS = 4`, the RATE bound. Keyed on `MAX(created_at)`
  among replacement assignments; `cooldownHours` is a real caller parameter.
- **Token-guarded route** — `/api/cron/auto-redispatch`, `GET`+`POST`, Bearer `CRON_SECRET`,
  SHA-256 + `timingSafeEqual` constant-time compare, **fails closed** on unset secret.
- **Manual-execution path** — working today; documented in `how-to-run.md`.
- **Thin-wrapper refactor** — `autoRedispatchSweepAction` reduced to auth + revalidate (−38 lines).
- **Sandbox-proven** end-to-end against the `TBSTUCK-` escalation cohort.
- **Doc set** — these eleven, plus `how-to-run.md` as an extra.

## Files Created or Changed
```
docs/phase-29-scheduled-trigger/how-to-run.md   |  95 +++   (new)
src/app/api/cron/auto-redispatch/route.ts       | 106 +++   (new)
src/server/auto-redispatch-sweep.ts             | 116 +++   (new)
src/app/(app)/notifications/actions.ts          |  44 +-    (refactor, −38)
CLAUDE.md                                       |   6 +-
```
Commits: `f49b3c8` (stage 2 — core + cooldown + route) · `96a72f8` (move eval harness off branch) ·
`af55f71` (stage 3 — vercel.json cron) · `a968728` (**removes** it; schedule deferred).

## Database Changes
**None.** No migration, table, column, or index. Code-only over existing tables. Highest active
migration unchanged at **0005** (Phase 28). See `08-db-changes.md`.

## API Routes / Server Actions Added
- **`GET|POST /api/cron/auto-redispatch`** — token-guarded, `force-dynamic`, `maxDuration = 300`.
  Guard → tenant enumeration (active `dispatch_router_v1` policies; scan-scope, **not** authorisation)
  → sequential per-tenant sweep → `{ ok, startedAt, durationMs, tenantsScanned, totals, perTenant }`.
  `401` on bad/missing token, no work done.
- **`runAutoRedispatchSweep({ tenantId, now?, cooldownHours? })`** — session-free server module.
- **`autoRedispatchSweepAction`** — refactored to a thin wrapper over the core.

## User-Facing Workflows Added
No new screen. The `/notifications` sweep button is unchanged **except** that it now also applies the
per-job cooldown (a job auto-re-dispatched within 4 h is skipped as `cooldown`). Operators gain a
second, equivalent way to fire the same sweep (`03-user-sop.md`).

## Admin/Internal Workflows Added
Setting and rotating `CRON_SECRET`; the enabling order for autonomy (kill switch → policy →
conditions → ceilings → quality → per-client consent, all default OFF); the four-step procedure for
adding a schedule when a live operation exists; emergency stop via kill switch (`04-admin-sop.md`).

## Business Rules Added
- **★ R-29.1 — TWO INDEPENDENT BOUNDS, both required:** COUNT `REDISPATCH_MAX_ATTEMPTS = 3`
  (**Phase 28**, `49e76c7`) bounds the total; RATE `REDISPATCH_COOLDOWN_HOURS = 4` (**Phase 29**)
  bounds re-entry frequency. Neither substitutes for the other.
- **R-29.2** — priority-varying stuck thresholds: EMERGENCY 2 h · URGENT 4 h · HIGH 8 h · ROUTINE 24 h ·
  SCHEDULED 48 h · DEFAULT 24 h. Wall-clock dwell, `SENT` only.
- **★ R-29.3** — only the shared sweep core may drive T1; T1 has no staleness check of its own.
- **R-29.4** — autonomy opt-in at every layer, default OFF; the trigger adds no permission.
- **★ R-29.5** — spend ceilings are correct **only because the sweep is sequential**. Do not
  parallelize (D-29.4).
- **R-29.6** — a gate-blocked action is **held as a reviewable draft**, never dropped.
- **R-29.7** — never re-tries a vendor already assigned on the job.

## ★ Correction to the Phase-28 Ledger
Phase 28 §3 recorded the per-job retry cap as *"unbuilt."* **That was inaccurate when written** — the
COUNT cap shipped in Phase 28 itself (`49e76c7`) and is on `main`. The genuinely missing piece was the
**RATE** bound, added here. The two bounds **together** close Phase-28 §3; the cooldown alone does not.
Full detail in `10-known-limitations.md` §3.

## Chatbot Knowledge Added
What the trigger is; how a sweep proceeds; the two bounds; that **nothing runs on a timer today** and
why; the safety posture (default-off, fail-closed); what remains deferred (`07-chatbot-knowledge.md`).

## Verification Performed

Type check, this closeout session:
```bash
pnpm tsc --noEmit          # exit 0 — see the reported TSC_EXIT
```

Branch inventory:
```bash
git diff --stat main..phase-29-scheduled-trigger
#  → 5 files, no schema/ or drizzle/ files touched (confirms "no DB changes")
```

Count-cap provenance (the ledger correction):
```bash
git log --oneline -1 -S "REDISPATCH_MAX_ATTEMPTS = 3" -- src/server/redispatch-suggestion.ts
#  → 49e76c7  phase 28: re-dispatch decision engine (... cap at 3 / exhausted)
git show main:src/server/redispatch-suggestion.ts | rg "REDISPATCH_MAX_ATTEMPTS = 3"
#  → present on main — i.e. pre-existing, not a phase-29 addition
```

Sandbox evaluation — `scripts/testbed/eval-trigger.ts`, run on the **`testbed-generator`** branch
against the `TBSTUCK-` cohort, driving **this exact route handler**. Asserted: token guard `401`s ·
autonomy-off writes nothing · the sweep fires · the stuck filter holds · the count cap holds · the
cooldown blocks a second immediate run · a `cooldownHours: 0` **control** proves the cooldown was the
cause · teardown restores everything touched.

> **Honest scoping of that claim:** the harness deliberately lives on `testbed-generator`, not on this
> branch (`96a72f8` — production code only), and was **not re-run during this closeout session**. The
> result above is the recorded outcome of that prior sandbox run; this session verified the branch
> inventory, the cap provenance, and the type check.

## Known Limitations
Full list in `10-known-limitations.md`. Headline items:
1. **★ The automated schedule is NOT wired** — deliberate; no live clients, and Vercel Hobby's daily
   cron cap is too coarse for a 2 h EMERGENCY threshold. Needs Pro or an external scheduler.
2. `CRON_SECRET` unset in deployed environments → the deployed route is inert.
3. **★ Phase-28 ledger correction** on the retry cap (above).
4. The "enforced twice" claim is verified at `decideRedispatchCore`; the candidate-exclusion path is
   read-verified at the `can_suggest` filter but **not traced through the state machine**.
5. must-notify-client send still not wired (carried, gated on #1).
6–10. New-job auto-dispatch out of scope; the auto-dispatch-vendor-notification question still open;
performance-ordered fallback awaiting `vendor_performance_scores`; no policy-conditions UI (CF-28.1);
business-hours clock still banked (CF-19.1).

## Carry-Forward Items
- **CF-29.1** — Wire the schedule when a live operation exists: choose Pro or external scheduler, set
  `CRON_SECRET` in the deployed env, add the crons entry, enable one low-stakes client first.
- **CF-29.2** — Wire the must-notify-client send via the Phase-19 seam (ships with CF-29.1).
- **CF-29.3** — Trace the `redispatchState` state machine to convert §4's partial verification into a
  full one.
- **CF-29.4** — Resolve whether autonomous dispatch/re-dispatch should notify the vendor (asymmetry
  with the manual path).
- **CF-29.5** — ★ Preserve the sequential-sweep constraint. Any future contributor optimising this
  loop into `Promise.all` silently breaks the spend ceiling. Commented at both sites; recorded here.

## Recommended Next Phase Focus
1. **Schedule the trigger** (CF-29.1) — the moment there is a live client. Everything else in the
   autonomy-enablement package is gated behind it.
2. **must-notify-client send** (CF-29.2) — becomes reachable the instant a schedule fires, and is an
   *obligation currently recorded but not discharged*. Highest-consequence follow-on.
3. Then the deferred **Settings surface** (policy conditions CF-28.1 + tenant LLM keys CF-23.1) — build
   together, not as separate screens.
