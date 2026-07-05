# Phase 28 — Admin SOP (Tenant Admin)

## The autonomy control stack (all must align for an action to auto-execute)
An autonomous action executes only when **every** layer permits it:
1. **Kill switch** (`tenant_autonomy_settings.kill_switch`) — when on, autonomy is globally OFF for the tenant. Reverts everything to gated immediately.
2. **Agent policy** (`agent_policies.policy.autonomyEnabled`) — must be literal `true`. Fail-safe default is gated (no policy / `requiresReview` → held).
3. **Guardrails** — token ceiling (`max_llm_tokens_per_day` / per-tenant) and committed-$ ceiling (`max_committed_per_job` / per-day / per-tenant). A NULL cap = no limit on that axis.
4. **Policy-conditions** (optional narrowing) — amount / trade / priority / client filters.
5. **Client consent** (Phase 28) — the job's client must have `autonomy_allowed = true`.
6. **Quality bar** — the accuracy floor (N/A for the deterministic dispatch router; wired for composition parity).

Any single layer holding the action drafts it for operator review.

## Enabling autonomy for a tenant
1. Set the agent policy `autonomyEnabled: true` (today via the blessed `activateAgentPolicy` path / `set-agent-conditions-policy.ts` script — the in-app Settings UI is deferred, CF-28.1 / CF-23.1).
2. Confirm the **kill switch is off**.
3. Set guardrail ceilings appropriate to the tenant (token/day, committed-$/job).
4. **Per client:** have the operator turn on **"Autonomy allowed"** for each client that has agreed to autonomous handling. Until then, that client's jobs stay gated even with tenant autonomy on (opt-in, D-28.1).

## Composing policy-conditions
The vocabulary (narrowing-only): amount threshold (effective NTE ≤ $X), trade allow/block (by stable trade code), priority allow/block (by stable priority code), client include/exclude (by client id). Set today via `set-agent-conditions-policy.ts`. Conditions can only make autonomy more restrictive — they never widen past the kill-switch, ceilings, consent, or the fail-safe gate. Confidence floors are not available (Phase-24-blocked).

## Consent semantics to communicate
- **`autonomy_allowed`** (opt-in, default false): the client agreed to autonomous handling.
- **`must_notify_client`** (default false): the client must be notified when an autonomous action fires. **The column exists but the notification is not yet sent** (deferred with the scheduled trigger). Setting it today records intent but sends nothing.

## Kill switch
Flipping `kill_switch` on reverts ALL tenant autonomy to gated instantly, regardless of per-agent policy, conditions, or consent. Use it as the emergency stop.
