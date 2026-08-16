# Phase 29 — Database Changes

## None.
**Phase 29 adds no migration, no table, no column, no index.** The trigger is **code-only** over
existing tables. Highest active migration is unchanged at **0005** (Phase 28).

`git diff --stat main..phase-29-scheduled-trigger` touches no file under `src/server/schema/` and no
file under `drizzle/`.

## Existing schema this phase reads
| Table | Used for |
|---|---|
| `agent_policies` | tenant enumeration (`agentId = 'dispatch_router_v1'`, `status = 'active'`) — scan-scope only |
| `job_vendor_assignments` | the cooldown lookup — `MAX(created_at)` where `replaces_assignment_id IS NOT NULL`, grouped by job |
| `jobs`, `clients`, `priorities`, `dispatch_assignment_statuses` | via `getExceptions` — candidate selection and stuck detection |

## Existing schema this phase relies on indirectly (through T1, unchanged)
- `tenant_autonomy_settings` — kill switch, token/spend ceilings.
- `clients.autonomy_allowed` / `clients.must_notify_client` — per-client consent (migration 0005).
- `agent_runs` / `agent_decisions` — the run + decision ledger written by every autonomous action.
- `job_vendor_assignment_status_history`, `audit_logs`, `job_events` — the audit sinks, system actor.

## Note on the cooldown query
It uses `replaces_assignment_id IS NOT NULL` to mean "this assignment was generated as a
re-dispatch". That column already existed (Phase 28's re-dispatch chain) — Phase 29 gave it a second
read purpose without altering it. One grouped query covers all candidate jobs; the cooldown is **not**
a per-job round trip.

## Migration ledger discipline (unchanged, restated)
`__drizzle_migrations` undercounts — the schema is ahead of the ledger by design. Generate with
`pnpm db:generate`; apply as direct DDL sandbox → verify → prod. **Never** run `drizzle-kit migrate`
against prod. Nothing in this phase required exercising any of that.
