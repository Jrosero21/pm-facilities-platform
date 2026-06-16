# Per-Dispatch Status Tracking — Admin SOP

## The `PENDING_INVOICE` status seed

The new job status ships as **reference data via the seed**, not a migration (the `job_statuses` table
already exists). `db/seeds/job-reference.ts` was made idempotent/convergent: it inserts a missing status and
**reflows `sort_order` on existing rows** (only `sort_order` — never name/category/terminal).

Run (global statuses; the tenant slug only affects the idempotent priorities/sequence steps):

    DATABASE_URL=<target-by-name> SEED_TENANT_SLUG=<tenant-slug> pnpm exec tsx db/seeds/job-reference.ts

- **Always target the DB by name.** The seed connects via `DATABASE_URL`; point it at the intended database
  explicitly (sandbox: `…/jonnyrosero_pm_sandbox`; prod: `…/jonnyrosero_pm`). Guard that the resolved name is
  the one you mean before running.
- **Already applied** to sandbox + prod (sandbox tenant `phase9-seed-tenant`, prod tenant `demo`). Re-running
  is safe — it converges (`1 inserted` first time, then `N sort_order-reflowed`); it never touches job rows.

Post-state (both DBs): 10 statuses, `PENDING_INVOICE` at sort 5 (non-terminal, category `completed`),
`ON_HOLD..CLOSED_BILLED` at 6..10.

## Reference data is seed-managed (MVP)

Job statuses, dispatch statuses, trades, and priorities are seeded reference data resolved by **code**. There
is **no admin UI** to add/rename/reorder them per tenant yet (banked — see the carry-forward bank). Changes
today are a seed edit + a by-name run.

## Verification harnesses (sandbox-only)

    pnpm run db:check:billing-close          # markBillingClosed → CLOSED_BILLED (6 assertions)
    pnpm run db:check:set-assignment-status  # operator hand-advance (8 assertions)
    pnpm run db:check:dispatch-job-follow     # single-vendor auto-follow (8 assertions)

Each is hard-guarded to refuse any DB whose name isn't `*_sandbox`, self-seeds, and tears down to 0 leftover.

## Connection budget (shared host)

`max_user_connections` is tight. The dev server (`pnpm dev`) holds a persistent DB pool; running several
`tsx` harnesses while it's up can exhaust the cap (`ER_TOO_MANY_USER_CONNECTIONS`). Stop the dev server, or
run harnesses one at a time, when you hit it.
