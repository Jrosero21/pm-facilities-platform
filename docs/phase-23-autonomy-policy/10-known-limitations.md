# Phase 23 — Known Limitations

Honest scope edges. None block the phase; each is tracked (see `closeout-carryforwards.md`).

## No live trigger (the big one) — Phase 24

`autoDispatchDraftForJob` is **callable but invoked by nothing** in app code (only the harness). No
job-creation hook, cron, or queue calls it. So even a fully-enabled, within-guardrails tenant
produces **zero** autonomous sends in production today. The live trigger **and** the observability
dashboard are **Phase 24** — deliberately, per §2.3 (permission ≠ readiness: don't let the system
act unwatched). Phase 23 built the *capability*; Phase 24 turns it on with a safety net.

## Dollar meter is O(N) per committed job

`tenantCommittedAllTime` / `withinSpendCeilings` resolve `getEffectiveNte` **once per
autonomy-committed job** (each = a `jobs` read + an approved-change-order sum) and Big.js-reduce
the results — there is no single SQL aggregate (money stays decimal-string + Big.js, never float;
no accumulator table). The **per-tenant lifetime axis** is the expensive one (unbounded job count).
Fine at current scale (autonomy volume is ~zero — no live trigger); a candidate optimization when
volume grows (CF-23.2). The per-day window is naturally bounded.

## Token meter governs operator LLM use, not autonomous LLM use

The token ceiling sums **all** tenant LLM tokens regardless of trigger — by design (the §2.4
decision). But the only autonomous agent today (`dispatch_router_v1`) is **rule-based and writes no
LLM tokens**, so there is no *autonomous* LLM usage to meter yet. The cap currently bounds
operator-triggered LLM agents (rewriter / scope). It becomes an autonomy guardrail proper when an
autonomous LLM agent exists.

## Fail-path tests reproduce the catch contract (no fault injection)

The guardrails fail toward gated (`ok: false`) on any thrown read, but the harness cannot
fault-inject the module-singleton `db`, so the fail-path assertions **reproduce the helper's exact
`try/catch` arm** against a forced query error rather than throwing from inside the real function.
The real guarantee is the `try/catch` wrapping every read in `withinTokenCeilings` /
`withinSpendCeilings` (visible in source). Similarly, the **thrown-send** disposition
(`queued_for_review` + failed run) is covered by code + decision, not a standalone harness group.

## `autonomyEnabled` field name reflects only two of three halves

`ResolvedPolicy.autonomyEnabled` is **policy + kill-switch** only. The full "may this action fire"
answer also needs `withinTokenCeilings().ok && withinSpendCeilings().ok`, ANDed at the
**enforcement site** (`autoDispatchDraftForJob`), not in the resolver. So the field name does not,
by itself, mean "fully permitted." This was a deliberate separation (don't fold spend metering into
the Phase-7 resolver), but the name is a clarity wrinkle (CF-23.x soft note).

## Rolling-24h window, not calendar day

"Per-day" everywhere is a **rolling trailing 24h** (`NOW() - INTERVAL 1 DAY`), DB-computed —
matching the house "now − duration" analytics style and dodging the absent tenant-timezone
question (`clients.timezone` exists for SLA business-hours, but there is no tenant tz). If a
**calendar-day** boundary (tenant-local midnight reset) is ever wanted, that's a net-new convention
(CF-23.x soft note).

## Other edges

- **Provenance requires a synthetic run.** `agent_decisions.agent_run_id` is NOT NULL with no
  direct `agent_id`, so every dispatch decision opens an `agent_runs` row (Option A). Tolerated
  (LLM columns nullable); a rule-based agent appears in `agent_runs` with NULL tokens/model.
- **WORK_COMPLETE counts as committed spend** (cumulative-spend model). If product ever wants a
  *live-exposure* meter (outstanding-only), that's a different filter — flagged, not built.
