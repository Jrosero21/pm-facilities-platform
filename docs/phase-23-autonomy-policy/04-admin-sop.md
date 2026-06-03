# Phase 23 — Admin SOP

Managing a tenant's autonomy posture. As of Phase 23 these are **data operations** on
`tenant_autonomy_settings` + `agent_policies` (no admin UI is shipped this phase — the management
screens follow with the Phase-24 observability surface). Examples below use the data layer /
direct rows; a UI will wrap them.

## ⚠️ Permission ≠ readiness (§2.3) — read first

Turning an agent's autonomy on is **giving the system permission to act**, which is **not the same
as the system being ready to act unwatched**. There is **no observability dashboard until Phase
24**. Until that lands, an enabled agent has no live monitoring surface for an operator to watch
auto-executed actions in real time, and **no live trigger invokes it anyway**. Treat enabling as a
deliberate, logged, reversible decision — not a default. The kill switch is always your immediate
revert.

## The guardrail table: `tenant_autonomy_settings`

One row per tenant (UNIQUE `tenant_id`). All ceilings default to NULL = **no cap** (the tenant has
not set a limit on that axis):

| Column | Meaning | NULL = |
|---|---|---|
| `kill_switch` | Tenant-wide autonomy off-switch (boolean, default false) | autonomy not killed |
| `max_committed_per_job` | Max committed $ (effective NTE) a single auto-dispatch may commit | no per-job cap |
| `max_committed_per_day` | Max committed $ across autonomy commits in a rolling 24h | no daily cap |
| `max_committed_per_tenant` | Max committed $ across all-time autonomy commits | no lifetime cap |
| `max_llm_tokens_per_day` | Max tenant LLM tokens (all agents) in a rolling 24h | no daily token cap |
| `max_llm_tokens_per_tenant` | Max tenant LLM tokens (all agents) all-time | no lifetime token cap |

Setting a row (or updating it) is how a tenant scopes "how much may autonomy commit." A tenant with
**no row at all** has no caps and no kill switch — but is still gated unless an agent policy opts in.

### Cap semantics

- A cap **blocks at-or-above** its value (`>= cap` blocks; the projected commit must be strictly
  below the cap to pass).
- The committed-$ meter counts **SENT, system-actor (autonomy-created)** dispatches, including
  **WORK_COMPLETE** (a completed commit is still spend); it excludes only **DECLINED / CANCELLED**
  (withdrawn).
- A job with **no NTE** is **unmeasurable** → the auto-send is **blocked** (can't bound the spend).

## Enabling an agent's autonomy

Autonomy is opted-in per agent via the agent's resolved policy. Insert/activate an `agent_policies`
row for the tenant (and optionally per-client) with:

```json
{ "autonomyEnabled": true, "requiresReview": false }
```

resolved through the ladder (per-client → per-tenant → platform default). The platform default for
`dispatch_router_v1` is `{ "requiresReview": true }` (no `autonomyEnabled`) — i.e. **gated** — so a
tenant must explicitly add the opt-in row. `autonomyEnabled` requires the literal `true`; anything
else stays gated.

**An enabled agent still obeys the kill switch and every cap.** "Enabled" is necessary, not
sufficient: the action must also be within token + spend ceilings and the kill switch must be off.

## Using the kill switch

Set `tenant_autonomy_settings.kill_switch = 1` for the tenant. Effective immediately, above all
policy, for **every** agent — the next governed run resolves gated (`policy_blocked`, source
`kill_switch`). This is the one control that reverts all autonomy regardless of any per-agent
opt-in. Clear it (`= 0`) to restore the per-agent posture.
