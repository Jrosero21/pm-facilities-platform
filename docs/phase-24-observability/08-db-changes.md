# Phase 24 — Database Changes

## NONE. No schema change, no migration, 0047 untouched.

Phase 24 added **zero** tables and **zero** columns. The latest migration remains **0046**
(`tenant_autonomy_settings`, Phase 23); **0047 does not exist** and was never created. Every
Phase-24 capability reuses existing structures:

- **Provider preference** reuses the existing **`agent_policies` / `agent_policy_defaults`
  `policy` JSON** column — a new `failoverOrder` key is **data, not DDL**, read via the
  resolver's `resolved.raw`. No column added.
- **Cost** reuses the existing `agent_runs.model` + `input_tokens` + `output_tokens` columns
  (compute-on-read; no `cost` column).
- **Observability** reads existing tables only (see below); it writes nothing.
- **Retention** clears existing nullable longtext columns to NULL (`UPDATE`, never DDL,
  never row delete).

## Tables READ by the observability surface (no writes from it)

| Reader | Tables read |
|---|---|
| `agentVolumeByAgent` | `agent_runs` |
| `agentDispositionBreakdown` | `agent_decisions` ⋈ `agent_runs` |
| `dispatchAutonomyBreakdown` | `agent_decisions` ⋈ `agent_runs` (filtered `dispatch_router_v1`) |
| `agentApproveAsIs` (rewriter adapter) | `update_rewrite_reviews` |
| `agentApproveAsIs` (scope adapter) | `job_scope_reviews` |
| `agentFailurePoints` | `agent_runs` (status='failed') |
| `agentCostByAgent` | `agent_runs` (model + tokens) |
| `agentLatencyDistribution` | `agent_runs` (started_at → completed_at) |

The `/agents` page issues only `SELECT`s. It performs **no** `INSERT`/`UPDATE`/`DELETE`.

## Tables WRITTEN by the retention job (UPDATE-to-NULL only, never DELETE)

- `agent_tool_calls.tool_input`, `agent_tool_calls.tool_output` → NULL when aged.
- `agent_decisions.metadata` → NULL when aged.

Rows are never deleted; all summary columns (`agent_runs.model`/tokens/status/timestamps,
`agent_decisions.disposition`, tool-call name/kind/status/sequence) are untouched, preserving
the observability + audit surfaces in full.

## Migration baseline

`db/migrations/` latest = **0046** (unchanged). **0047 untouched / nonexistent**, as required
for every Phase-24 batch.
