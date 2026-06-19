# B-16.4 — Admin SOP

## Running the scorer
`computeVendorPerformanceScores(tenantId)` reads the tenant's dispatch history and writes
`vendor_performance_scores` (delete-then-insert, idempotent). It is invoked programmatically (no cron
exists yet — a scheduled recompute is a future add). Re-run any time to refresh scores after new dispatch
activity.

## Verifying the scorer (gate)
Against the sandbox:

    pnpm run db:check:vendor-performance

Expected: `VPS HARNESS GREEN — scorer ranks archetypes correctly.` (14/14), exit 0. The harness is
**sandbox-guarded two ways** — a module-top env-swap to `jonnyrosero_pm_sandbox`, plus a runtime
`SELECT DATABASE()` backstop that aborts (exit 2) before any write if the live connection isn't a
`*_sandbox` DB. It runs the populator against the b164 seed fixture and asserts the archetype ranking.
The SSH tunnel must be up.

## Prerequisite — migration 0054 (PROD STILL PENDING)
The scorer writes `total_dispatches` + `completion_rate` (added by migration 0054). Sandbox has them
(applied 2026-06-18). **Prod does NOT yet** — apply the two statements as a **direct ALTER** (sandbox→prod
pattern), NOT `drizzle-kit migrate` (the `__drizzle_migrations` ledger undercounts and would replay
0049–0053):

    ALTER TABLE `vendor_performance_scores` ADD `total_dispatches` int;
    ALTER TABLE `vendor_performance_scores` ADD `completion_rate` decimal(5,2);

Guard to prod with `SELECT DATABASE()` first. Until 0054 is prod-applied, the scorer cannot write in prod.

## The synthetic fixture (sandbox only)
`pnpm tsx --env-file=.env.local --conditions=react-server scripts/seed-b16-4/run.ts` generates the
55-vendor world (`--reset` to re-seed, `--teardown` to remove). Sandbox-only by the same two-layer guard.
`manifest.json` (the harness oracle) is gitignored — regenerated per run.
