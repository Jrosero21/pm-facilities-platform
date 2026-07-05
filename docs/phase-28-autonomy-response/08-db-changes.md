# Phase 28 — Database Changes

## Migration 0005 (`0005_great_leader.sql`) — Batch 1, this phase
```sql
ALTER TABLE "clients" ADD COLUMN "autonomy_allowed" boolean DEFAULT false NOT NULL;
ALTER TABLE "clients" ADD COLUMN "must_notify_client" boolean DEFAULT false NOT NULL;
```
- Both **additive, NOT NULL, default false** → zero-downtime; every existing row is valid immediately. Mirrors the `is_priority` migration shape (`0003`).
- `autonomy_allowed` — per-client opt-in consent gate for the autonomous paths (read by `clientAutonomyConsent`).
- `must_notify_client` — per-client obligation flag; **column only** (no send wired this phase).
- **Applied to:** local `pm` + `pm_sandbox` (direct ALTER, per the migration-ledger discipline — never `drizzle-kit migrate`). **Prod Neon: NOT yet applied** — must be applied before/at deploy (schema-first, like `0004`).

## Schema source
`src/server/schema/clients.ts` — both columns declared beside `isPriority`, with comments documenting the opt-in fail-safe intent and the deferred send.

## Pre-existing schema this phase relies on (shipped post-27, not new here)
- `agent_policies.policy` (JSON) — carries `autonomyEnabled`, `requiresReview`, and the policy-conditions block (amount/trade/priority/client).
- `tenant_autonomy_settings` — `kill_switch`, `max_llm_tokens_per_day`, `max_committed_per_job` (+ per-tenant caps).
- `agent_runs` / `agent_decisions` — the run + decision ledger; `decisionMeta` now carries `clientAutonomyAllowed`.
- `job_vendor_assignment_status_history`, `audit_logs`, `job_events` — the autonomous re-dispatch sinks (system actor / nullable).

## Audit actions added
- `client.autonomy_consent_changed` — written by `updateClient` on an actual change to `autonomy_allowed` (metadata `{ from, to }`; change-only, mirrors `client.priority_flag_changed`).

## Migration ledger note
`__drizzle_migrations` undercounts (schema is ahead). Generate with `db:generate`; apply as direct ALTER sandbox→prod; never replay via `drizzle-kit migrate`. Highest active migration after this phase: **0005**.
