# Phase 29 — Business Rules

## ★ R-29.1 — TWO INDEPENDENT BOUNDS on autonomous re-dispatch, both required
These are different mechanisms answering different questions. Neither substitutes for the other.

| Bound | Constant | Where | Question it answers | Shipped |
|---|---|---|---|---|
| **COUNT** | `REDISPATCH_MAX_ATTEMPTS = 3` | `src/server/redispatch-suggestion.ts` | *How many times, ever?* — bounds the TOTAL | **Phase 28** (`49e76c7`) |
| **RATE** | `REDISPATCH_COOLDOWN_HOURS = 4` | `src/server/auto-redispatch-sweep.ts` | *How often?* — bounds RE-ENTRY FREQUENCY | **Phase 29** (`f49b3c8`) |

**Why both.** The count cap alone bounds a job to 3 attempts ever — but leaves an unattended caller
free to burn all three in ~45 minutes across three ticks. A human clicking a button paced re-entry
naturally; a trigger does not. The cooldown alone would bound frequency but never terminate.

- **COUNT is enforced in two places:** candidate exclusion (`redispatchState === 'exhausted_max_attempts'`
  never reaches the sweep) and `decideRedispatchCore`'s first branch. `attemptsSoFar` counts vendors
  **actually SENT** — a pending un-sent DRAFT does not count.
- **RATE is keyed on `MAX(created_at)`** among the job's replacement assignments, deliberately not
  `sent_at` (a contact timestamp that gets backdated). `cooldownHours` is a caller parameter
  defaulting to the constant.

> See `10-known-limitations.md` §3 — this corrects Phase 28's ledger, which recorded the count cap as
> unbuilt when it had in fact shipped in Phase 28 itself.

## R-29.2 — Stuck thresholds vary by priority (wall-clock dwell in `SENT`)
From `DISPATCH_STUCK_THRESHOLDS_SECONDS` (`src/server/analytics/dispatch-sla-rules.ts`). A dispatch is
stuck when dwell **exceeds** the threshold:

| Priority code | Threshold |
|---|---|
| `EMERGENCY` | **2 h** |
| `URGENT` | 4 h |
| `HIGH` | 8 h |
| `ROUTINE` | 24 h |
| `SCHEDULED` (priority code, not dispatch status) | 48 h |
| `DEFAULT` (null / unknown / unmapped) | 24 h — treated as routine |

Only the `SENT` status is populated today (the SENT-only rung); the nested shape leaves the banked
all-statuses follow-on drop-in. Wall-clock, not business-hours (CF-19.1 banked).

★ The **2 h EMERGENCY** threshold is what makes a once-per-day scheduler useless — see D-29.5.

## ★ R-29.3 — Only the shared sweep core may drive T1
`autoRedispatchForStuckAssignment` (T1) has **no staleness check of its own**. The `can_suggest`
stuck-filter lives in `runAutoRedispatchSweep`. Any future caller — cron, queue, external scheduler —
that reaches T1 directly will re-dispatch **perfectly healthy jobs**.

## R-29.4 — Autonomy is opt-in at every layer, default OFF
Kill switch, policy `autonomyEnabled`, and per-client `clients.autonomy_allowed` all default to a
blocking state. The tenant grants *capability*; the client grants *permission*. The trigger adds no
permission — it only selects which tenants to scan, and omitting a tenant can only mean less work.

## R-29.5 — Money is bounded by serialization
Spend ceilings (`withinSpendCeilings`) are only correct because the sweep is **sequential**: each check
sees the prior action's committed spend. This is a business rule enforced by control flow, not a
performance choice (D-29.4).

## R-29.6 — A blocked action is held, never dropped
When a gate blocks, T1 still **prepares** the draft and returns `prepared_blocked`. The work survives
as a reviewable draft in the exceptions queue. Autonomy that cannot act degrades into assistance, not
into silence.

## R-29.7 — Re-dispatch never re-tries a vendor already on the job
`triedVendorIds` covers every vendor assigned on the job, terminal or not. Combined with fresh
re-ranking, the fallback walks *down* the candidate list and never loops.
