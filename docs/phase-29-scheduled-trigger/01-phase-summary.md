# Phase 29 — Scheduled Trigger (Phase Summary)

**Version:** v3.1.0-phase-29 — the first v3 phase; closes Phase 28's load-bearing deferral.

## Goal
Build the **unattended-trigger mechanism** for autonomous re-dispatch — the piece Phase 28's
`10-known-limitations.md` named as *"the single deferral that makes several others moot until it
lands."* Phase 28's autonomy was real but operator-*button*-triggered; a human still started every
autonomous action. Phase 29 makes the engine callable by something that is not a person.

## What Phase 29 is

| Piece | State |
|---|---|
| **Session-free sweep core** (`runAutoRedispatchSweep`) — the operator button's loop body extracted verbatim, so button and trigger run identical code including the stuck-filter | **Built** (`f49b3c8`) |
| **Per-job cooldown** (`REDISPATCH_COOLDOWN_HOURS = 4`) — the RATE bound an unattended caller needs | **Built** (`f49b3c8`) |
| **Token-guarded route** `/api/cron/auto-redispatch` — Bearer `CRON_SECRET`, constant-time, fail-closed | **Built** (`f49b3c8`) |
| **Manual-execution path** — the route fired by hand (`curl`), documented in `how-to-run.md` | **Built + working today** |
| **Automated schedule** (`vercel.json` crons entry) | **Deliberately deferred** (`af55f71` added it, `a968728` removed it) |

## The honest shape: mechanism complete, schedule deferred by design
The trigger *mechanism* is finished and sandbox-proven end-to-end. What is not wired is the **timer**.
That is a deliberate call, not an unfinished edge: **there are no live clients today**, so an
unattended schedule would fire against test data and prove nothing it has not already proven in the
sandbox. The route's path and header format already match what Vercel Cron sends, so adding the
schedule later is a one-file change with **no change to the route**.

Phase 29 therefore ships an autonomy path that is **callable on demand** rather than **timed** —
and every guardrail that a timed caller would need is in place and proven *before* the timer exists,
which is the correct order.

## What this phase does NOT claim
It does not claim unattended operation is live. It is not. It claims the mechanism, the bounds, and
the safety posture are built and verified, and that turning on a schedule is now a configuration
decision rather than a build. See `10-known-limitations.md` — including a **correction to Phase 28's
ledger** on the retry cap.

## Scope discipline
No schema change (`08-db-changes.md`). One new route, one new server module, one action refactored to
a thin wrapper. The sandbox evaluation harness deliberately lives on `testbed-generator`, **not** on
this branch (`96a72f8`) — production code only.
