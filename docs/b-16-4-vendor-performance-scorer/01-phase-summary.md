# B-16.4 — Vendor Performance Scorer — Summary

## What this is
A sub-feature delivering **B-16.4** (a Phase-16 bank item): the scorer that turns vendor dispatch
history into a defensible per-vendor performance score, and surfaces it to operators. B-16.4 is the
**data keystone** the roadmap's Phase-27 (AI-Assisted Dispatch, Tier 3) is blocked on — AI dispatch
"cannot be good until the vendor portal has generated performance history" *and* requires
`vendor_performance_scores` populated. This builds and populates exactly that.

## The gap it closes
`vendor_performance_scores` existed (schema-only since Phase 9) but was **empty** — no code computed it.
The dispatch engine (Phase 22) routes by hard rules only; it has no quality signal to rank eligible
vendors by. And dev has just **1 vendor with 1 completed job** — nothing to design or validate a scorer
against. This delivers the compute, the populate, the read surface, and the synthetic data to prove it.

## The vertical slice (4 commits)
1. **`ddd4592`** — synthetic fixture generator (`scripts/seed-b16-4/`): 55 vendors across 6 hidden
   archetypes, full lifecycle history + presence, sandbox-guarded, deterministic.
2. **`244e2f1`** — migration **0054**: `total_dispatches` + `completion_rate` columns (additive,
   nullable) — a first-class home for completion, the dominant metric.
3. **`30ca4bf`** — the scorer (`src/server/analytics/vendor-performance.ts`): `computeVendorPerformanceScores`
   (populator) + `getVendorPerformanceScores` (reader), plus the manifest-asserting harness
   (`scripts/check-vendor-performance.ts`, gate `db:check:vendor-performance`).
4. **`7792cca`** — chatbot read surface: `summarizeVendorPerformanceTool` now returns real scores when
   computed, profile-only fallback when not.

## Status
**Code-complete; validated against the synthetic fixture.** `db:check:vendor-performance` is 14/14 green;
the cohort ranking is correct (reliable_fast 77.7 > reliable_slow 68.8 > newcomer_thin 58.0 >
flaky_fast 49.5 > flaky_unreliable 28.7). Remaining to fully close: **migration 0054 prod-apply** (the
two direct ALTERs, gated) before the scorer runs on real prod data. The AI-dispatch *consumer* (the real
Phase 27) is a separate, still-unbuilt phase — B-16.4 unblocks it; it does not build it.
