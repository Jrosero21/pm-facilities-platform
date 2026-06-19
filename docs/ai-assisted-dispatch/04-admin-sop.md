# AI-Assisted Dispatch — Admin SOP

## Per-tenant tiebreaker firing mode
Stored as `tiebreakerMode` in the agent policy JSON (`agent_policies` /
`agent_policy_defaults`), resolved tenant → default. Values:
- `autonomy_only` (platform default) — fire only when the tenant has dispatch
  autonomy enabled.
- `always_on_close_call` — fire on every close call, including held drafts.
- `off` — never fire; deterministic ranking only.
Set a tenant override by writing a tenant-scoped `agent_policies` row for the
relevant agent; the resolver ladder honors tenant over default.

## Landing platform defaults in production (GATED)
Defaults are seeded in sandbox only. To land them in prod:
`SEED_ALLOW_PROD=1 pnpm db:seed:agent-config`
- This is an explicit, irreversible-class prod write — confirm before running.
- It also backfills `proposal_generator_v1` / `invoice_creator_v1` prompt
  defaults if prod lacks them (idempotent). Review the full set it touches first.
- Without it, the non-mock tiebreaker path throws `NoActivePromptError` in prod;
  the offline mock path is unaffected.

## Guardrails (non-overridable)
- Token ceiling (`withinTokenCeilings`, tenant-wide) is checked BEFORE any
  tiebreaker LLM spend. Over budget ⇒ no call ⇒ deterministic ranking.
- The kill switch (via `resolveAgentPolicy` step 0) forces gated/no-autonomy and
  makes `tiebreakerMode` default-safe (raw null ⇒ autonomy_only ⇒ won't fire
  without autonomy).
- No `tiebreakerMode` value can spend past the token ceiling.

## Seed safety
`db/seeds/agent-config.ts` defaults to the sandbox DB; prod requires
`SEED_ALLOW_PROD=1`. The seed is idempotent (insert-if-absent + a targeted
idempotent UPDATE for the `dispatch_router_v1` `tiebreakerMode` key).

## Verifying
`pnpm run db:check:ai-dispatch` (sandbox-guarded; self-seeds, self-tears-down).
