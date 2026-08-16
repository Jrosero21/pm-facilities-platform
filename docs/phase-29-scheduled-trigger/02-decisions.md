# Phase 29 — Decisions

## D-29.1 — Extract a session-free sweep core (`runAutoRedispatchSweep`)
The operator button's loop body moved **verbatim** out of `autoRedispatchSweepAction` into
`src/server/auto-redispatch-sweep.ts`. The action kept only its request-scoped concerns (auth +
`revalidatePath`).

**Why it had to be shared, not copied:** the `can_suggest` **stuck-filter** is the only thing standing
between a trigger and re-dispatching perfectly healthy jobs — `autoRedispatchForStuckAssignment` (T1)
has **no staleness check of its own**. A second, parallel implementation for the trigger would
eventually drift from the button's and silently lose that filter. Extracting one core makes the
constraint *structural* rather than a thing each caller must remember.

★ **Standing rule:** anything that fires this sweep in future — cron, queue, external scheduler,
another action — must call `runAutoRedispatchSweep`, **never T1 directly.**

## D-29.2 — Add a per-job COOLDOWN (the rate bound)
`REDISPATCH_COOLDOWN_HOURS = 4`. Keyed on `MAX(created_at)` among the job's replacement assignments
(`replaces_assignment_id IS NOT NULL`).

**Why `created_at`, not `sent_at`:** `sent_at` is a *contact* timestamp that gets adjusted and
backdated by operators; `created_at` is when the re-dispatch was actually **generated**, which is the
event being rate-limited.

**Why it is needed at all:** a human clicking a button paced re-entry naturally. A trigger does not —
without this bound it re-enters the same job on every tick the moment its replacement goes stale.
`cooldownHours` is a real caller parameter (not a test backdoor), defaulting to the constant.

## D-29.3 — Token-guarded route, failing CLOSED
`Authorization: Bearer $CRON_SECRET`, on both `GET` and `POST` (same handler).

- **Constant-time compare** via `timingSafeEqual`, with both sides **SHA-256'd first** so the
  comparison operates on fixed-length buffers. Comparing raw secrets would let `timingSafeEqual`'s
  length-mismatch throw leak the secret's length.
- **Unset `CRON_SECRET` disables the endpoint** (`if (!expected) return false`). An unset secret can
  never mean "open" — the deployed route is inert until the env var is set.
- A wrong or missing token returns `401` and does no work, leaking nothing about why.

## D-29.4 — ★ The sweep is SEQUENTIAL; never `Promise.all`
Both loops — jobs within a tenant, and tenants within the route — `await` each iteration before the
next.

**Why:** each T1 call runs `withinSpendCeilings`. Sequential firing means each check sees the prior
action's **committed** spend, so the per-day / per-tenant dollar ceiling halts a burst. Parallelising
would let two concurrent checks read the same pre-commit total and both pass — the ceiling would be
breached by exactly the amount of concurrency.

★ **This is a non-obvious correctness constraint that reads like a missed optimisation. DO NOT
parallelize this loop.** It is commented at both sites for the same reason.

## D-29.5 — Defer the automated schedule until live clients exist
Stage 3 (`af55f71`) added a `vercel.json` crons entry at `*/15`. It was **removed** in `a968728`.

**Why deferred:**
1. **No live clients.** An unattended timer today fires at test data and proves nothing the sandbox
   harness has not already proven deterministically.
2. **Tier mismatch.** Vercel's Hobby tier caps cron frequency at **once per day** — far too coarse for
   a **2-hour EMERGENCY** stuck threshold. Meaningful scheduling needs Vercel Pro or an external
   scheduler; that is a paid infrastructure decision, not a build task.
3. **Cost of deferring is near zero.** The route already matches Vercel Cron's path and header format,
   so the schedule is a one-file addition with no route change.

The manual-execution path works today and exercises the identical code, so nothing is untested by
this deferral.

## D-29.6 — Keep the evaluation harness OFF this branch
`scripts/testbed/eval-trigger.ts` lives on `testbed-generator` (`96a72f8` moved it off). This branch
carries **production code only**; the harness imports the canonical guard and the phase-29 code it
exercises rather than duplicating either.

## D-29.7 — Tenant enumeration is scan-scope, not authorisation
The route scans tenants holding an **active `dispatch_router_v1` policy**. This is stated in-code as a
*scan-scope optimisation*: omitting a tenant can only mean **less work, never more permission**. Every
job is still fully re-gated inside T1.
