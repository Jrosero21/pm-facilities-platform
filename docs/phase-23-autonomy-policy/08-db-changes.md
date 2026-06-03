# Phase 23 — Database Changes

## Migration 0046 — `tenant_autonomy_settings` (the only schema change)

File: `db/migrations/0046_groovy_rawhide_kid.sql`. One new table — the §2.4 non-overridable
guardrail home, one row per tenant. Applied: sandbox → prod (gated). **Table count 118 → 119.**

Live schema (prod `SHOW CREATE TABLE`):

```sql
CREATE TABLE `tenant_autonomy_settings` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `kill_switch` tinyint(1) NOT NULL DEFAULT 0,
  `max_committed_per_job` decimal(12,2) DEFAULT NULL,
  `max_committed_per_day` decimal(12,2) DEFAULT NULL,
  `max_committed_per_tenant` decimal(12,2) DEFAULT NULL,
  `max_llm_tokens_per_day` int(11) DEFAULT NULL,
  `max_llm_tokens_per_tenant` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tas_tenant_unique` (`tenant_id`),
  CONSTRAINT `tas_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
```

- **`UNIQUE (tenant_id)`** — tenant-singular (the §2.4 layer is one row per tenant). Sound as a
  DB-level unique (no nullable key, unlike `agent_policies`).
- **FK `tas_tenant_fk` → `tenants(id)` ON DELETE CASCADE** — settings die with the tenant.
- `kill_switch` boolean renders as `tinyint(1) DEFAULT 0` (MariaDB; `false`). All five ceilings
  nullable — **NULL = no cap** (distinct from 0, which would forbid any spend).
- Drizzle source: `src/server/schema/autonomy-settings.ts` (`tenantAutonomySettings`).

## Seed — `dispatch_router_v1` platform policy default (prod-applied)

A third row added to `agent_policy_defaults` via the existing `db/seeds/agent-config.ts`
(extended so a rule-based agent seeds a **policy default only**, no prompt template):

```
agent_id: dispatch_router_v1   status: active   policy: {"requiresReview":true}
```

Byte-identical to the other two defaults (`scope_generator_v1`, `update_rewriter_v1`). This makes
`dispatch_router_v1` resolve **fail-safe-gated from birth** via the `default` source — no
`autonomyEnabled`, so autonomy is off until a tenant opts in. Applied to sandbox (23d) and prod
(the prod-seed gate). Prod `agent_policy_defaults` now has 3 active rows.

## Reused tables (no schema change)

- **`agent_runs`** — the synthetic auto-dispatch run (Option A provenance):
  `agent_id = "dispatch_router_v1"`, `trigger_source = "auto_dispatch"`, token columns **NULL**
  (rule-based, no LLM). No new columns.
- **`agent_decisions`** — the enforcement disposition row (`auto_executed` / `policy_blocked` /
  `queued_for_review`). The enum already contained `auto_executed` and `policy_blocked` (defined in
  Phase 6/7, **first written in Phase 23**). `agent_run_id` is NOT NULL — hence the synthetic run.
- **`job_vendor_assignments`, `job_status_history`, `job_events`, `audit_logs`** — written by
  `sendDispatch` on auto-advance with NULL system actors (the nullable sinks confirmed in 23f; **no
  migration needed** for the NULL-actor send).

## What did NOT change

No other migrations (0046 is final for Phase 23). No new columns on any existing table. The dollar
and token meters are **compute-on-read** — there is deliberately **no accumulator/ledger table**.
