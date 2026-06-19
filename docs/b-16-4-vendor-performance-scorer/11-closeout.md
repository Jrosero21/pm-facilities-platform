# B-16.4 — Vendor Performance Scorer — Closeout

## Feature Goal
Deliver B-16.4: compute + populate `vendor_performance_scores` from dispatch history and surface it to
operators — the data keystone unblocking the roadmap's Phase-27 AI-Assisted Dispatch.

## Completed Deliverables
- Synthetic fixture generator (55 vendors, 6 archetypes), sandbox-guarded, deterministic.
- Migration 0054 (`total_dispatches` + `completion_rate`), applied to sandbox.
- The scorer: `computeVendorPerformanceScores` (two-pass, shrinkage) + `getVendorPerformanceScores`.
- Chatbot read surface (`summarizeVendorPerformance` returns real scores).
- Phase-blocking harness, 14/14 green (`db:check:vendor-performance`).

## Files Created or Changed
- `scripts/seed-b16-4/{config,generate,timeline,run}.ts` — fixture generator (`ddd4592`)
- `src/server/schema/vendor-details.ts` + `db/migrations/0054_medical_warstar.sql` — migration (`244e2f1`)
- `src/server/analytics/vendor-performance.ts` + `scripts/check-vendor-performance.ts` + `package.json`
  gate — scorer (`30ca4bf`)
- `src/server/agents/chatbot-assistant/operational-tools.ts` — chatbot reader (`7792cca`)
- (`scripts/seed-b16-4/manifest.json` gitignored — generated per-run harness oracle.)

## Database Changes
Migration 0054 — two additive nullable columns. Sandbox applied; prod pending (direct ALTER, gated).
See 08-db-changes.md.

## API Routes / Server Actions Added
None (no HTTP routes). Two server functions + one extended chatbot tool. See 09-api-routes.md.

## Business Rules Added
BR1–BR8 (06-business-rules.md): completion/total, on-time/completed, 0.7/0.3 composite, K=5 shrinkage,
per vendor×trade, avg_rating null, idempotent tenant-scoped, status-by-code.

## Verification Performed
db:check:vendor-performance — 14/14 GREEN (sandbox, two-layer guard)

cohort ranking: reliable_fast 77.7 > reliable_slow 68.8 > newcomer_thin 58.0 > flaky_fast 49.5 > flaky_unreliable 28.7

completion-dominant weighting confirmed: reliable_slow (done-but-late) outranks flaky_fast (fast-but-flaky)

reliable_slow distinction: completion 87.3 vs on-time 45.5 (the deliberate split)

tsc --noEmit + eslint clean across all scorer + chatbot files

## Recorded Lesson — the dev-pollution incident
On the FIRST seed run, the 55-vendor world landed in the **DEV** database, not sandbox — the module-top
sandbox guard mutated `process.env.DATABASE_URL`, but a **static `import { db }` hoisted above it** (ESM
import hoisting) and connected to dev before the swap ran. Caught immediately via a post-run row check;
the pollution (one namespaced tenant, ~12k rows, no real data touched) was removed by a tenant-scoped
sweep. **Fix — two layers:** (1) all db-connecting imports made **dynamic** (`await import` inside
functions, after the guard); (2) a **`SELECT DATABASE()` runtime backstop** that aborts (exit 2) before
any write unless the live connection is `*_sandbox` — checking the real connection, not the env var. Both
the seed and the harness now print `connected DB confirmed: …_sandbox` as their first line. Lesson: a
module-top env-guard is defeated by static imports; verify the **connection**, not the intent.

## Known Limitations
See 10-known-limitations.md: 0054 prod-apply pending (L1); AI-dispatch consumer unbuilt (L2); no rating
capture (L3); synthetic-only validation (L4); no scheduled recompute (L5); §9 over-attribution note (L6).

## Carry-Forward Items
This sub-feature set carries no `closeout-carryforwards.md` (the bank stays phase-level). Dispositions
recorded in the live phase bank (`docs/phase-27-proposal-agent/closeout-carryforwards.md`):
- **B-16.4 — RETIRED** (moved from the Phase-16 open table to the retired/discharged section).
- **CF-26.1 — stays OPEN**, stale sub-clause corrected (`vendor_performance_scores` now populated; the
  real blocker is `vendor_rates`, still empty).
- **0054 prod-apply** — remaining gate, tracked under B-16.4's retirement note (not CF-iii.1; that's R2).

## Recommended Next Focus
Prod-apply 0054 (the last gate to run B-16.4 in production); then, when prioritized, the real Phase-27
(AI-Assisted Dispatch) — now data-unblocked — consuming these scores over the Phase-22 eligibility set
under Phase-23 policy.
