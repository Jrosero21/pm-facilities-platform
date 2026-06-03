# Phase 23 Closeout — Autonomy Policy Engine + Guardrail Layer

## Phase Goal

Extend the binary in-code `{requiresReview}` gate into a **per-tenant, per-agent autonomy policy**
with a **non-overridable guardrail layer** (kill switch + committed-$ and LLM-token ceilings), and
wire the **first autonomous action** — rule-based auto-dispatch advancing a DRAFT to SENT. MVP
granularity is **per-agent on/off** (the condition vocabulary is Phase 28). Fail-safe-off by
default; no live trigger (gated behind Phase 24 observability).

## Completed Deliverables

- Kill switch as **resolver step 0** (above all policy, per tenant).
- Per-agent **`autonomyEnabled`** opt-in (policy JSON, fail-safe-by-construction) + the new
  `"kill_switch"` resolution source.
- **Compute-on-read guardrails** (no accumulator): `withinTokenCeilings` (all-tenant LLM tokens,
  24h + lifetime) and `withinSpendCeilings` (committed NTE per job/day/tenant, cumulative).
- **DRAFT→SENT auto-advance** via `sendDispatch({ actorUserId: null })` (NULL system actor).
- **First `auto_executed` / `policy_blocked`** enforcement dispositions (Option-A synthetic-run
  provenance) + the new `AutoDispatchResult` outcomes.
- `dispatch_router_v1` registered + seeded as a fail-safe-gated platform default (prod-applied).
- Standing harness `scripts/check-phase-23.ts` (`db:check:autonomy`).

## Files Created or Changed

Across 3 commits:
- **`9987d9e`** — add `tenant_autonomy_settings` guardrail table (0046): `db/migrations/0046_groovy_rawhide_kid.sql`, `src/server/schema/autonomy-settings.ts`, schema index.
- **`4d454c7`** — resolver kill-switch (step 0) + `dispatch_router_v1` default + `autonomyEnabled` (policy half): `src/server/agents/config/policies.ts`, `src/server/agents/registry.ts`, `db/seeds/agent-config.ts`.
- **`dba659e`** — autonomy enforcement + spend/token guardrails + auto-advance + harness: `src/server/agents/config/guardrails.ts`, `src/server/auto-dispatch.ts`, `src/server/dispatch.ts`, `scripts/check-phase-23.ts`, `package.json`, `scripts/check-phase-22.ts` (vocabulary migration `drafted`→`drafted_pending`).

## Database Changes

- **Migration 0046** — `tenant_autonomy_settings` (one row/tenant; `kill_switch` + 5 nullable
  ceilings; UNIQUE `tenant_id`; FK → tenants CASCADE). **118 → 119 tables.**
- **Seed** — `dispatch_router_v1` row in `agent_policy_defaults` (`{"requiresReview":true}`,
  active), prod-applied.
- Reused (no schema change): `agent_runs` (synthetic run), `agent_decisions`
  (`auto_executed`/`policy_blocked` first written), and the `sendDispatch` write sinks (NULL actor).
- See `08-db-changes.md`.

## API Routes / Server Actions Added

None (no HTTP routes, no UI, no live trigger). Server-side surface changes: `AutoDispatchResult`
union (bare `"drafted"` removed), `sendDispatch` actor widening (`string | null`), the
`guardrails.ts` meter exports, and `resolveAgentPolicy`'s `autonomyEnabled` + `kill_switch` source.
See `09-api-routes.md`.

## User-Facing Workflows Added

Operator: gated drafts surface as `drafted_pending` exceptions (manage-by-exception); enabled
tenants get `auto_advanced` system-actor sends; the kill switch reverts all autonomy; decisions read
as `auto_executed` / `policy_blocked`. See `03-user-sop.md`. (No UI this phase; behavior is via the
data layer until Phase 24.)

## Admin/Internal Workflows Added

Tenant autonomy management via `tenant_autonomy_settings` (caps + kill switch) and per-agent opt-in
via `agent_policies` (`autonomyEnabled:true`), with the §2.3 permission≠readiness warning. See
`04-admin-sop.md`.

## Business Rules Added

The v2 invariants §2.1–2.7 mapped to harness assertions + the Phase-23 rules (two-NULLs,
cumulative-spend, `>=` blocks, NULL-actor advance, thrown-send disposition). See `06-business-rules.md`.

## Chatbot Knowledge Added

Autonomy definition, the 4 production agents (incl. `dispatch_router_v1`), the three composed halves
of permission, the dispositions, and the no-live-trigger state. See `07-chatbot-knowledge.md`.

## Verification Performed

```bash
pnpm db:check:autonomy   # scripts/check-phase-23.ts — 30 passed / 0 failed (fresh file-read)
#   gated-default / enabled-auto-advance / kill-switch / spend+token guardrails / null-NTE /
#   idempotency / eligibility-floor / cross-tenant / null-actor job-advance / default-source / cumulative-spend
pnpm db:check:dispatch   # scripts/check-phase-22.ts — 30 passed / 0 failed (re-confirm, governed vocabulary)

npx tsc --noEmit         # 0 errors
# prod: SELECT agent_id,status FROM agent_policy_defaults WHERE agent_id='dispatch_router_v1'  → active
# prod: 119 tables; tenant_autonomy_settings present (UNIQUE tenant_id, FK CASCADE)
```

Both harnesses green from fresh reads; sandbox left pristine (tracked-id teardown under
`FK_CHECKS=0`).

## Known Limitations

No live trigger (Phase 24); O(N) dollar meter (lifetime axis); token meter governs operator LLM use
today; fail-path tests reproduce the catch contract; `autonomyEnabled` name = 2 of 3 halves;
rolling-24h not calendar-day. See `10-known-limitations.md`.

## Carry-Forward Items

The full bank rolled forward from Phase 22 **unchanged** (Phase 23 retires nothing), plus new
Phase-23 items: **CF-23.1** (tenant LLM API keys + self-service AI restrictions — depends Phase-24
multi-provider + CF-12.4 encryption), **CF-23.2** (O(N) dollar-meter optimization), and soft notes
(autonomyEnabled-naming clarity; calendar-day vs rolling-24h; live-trigger + first enablement →
Phase 24). See `closeout-carryforwards.md`.

## Recommended Next Phase Focus

**Phase 24 — Observability + live enablement.** The readiness safety net that unblocks real-tenant
autonomy: a dashboard over the provenance rows (`agent_runs`/`agent_decisions`, `auto_executed` vs
`policy_blocked`, the spend/token meters), the **live trigger** that invokes `autoDispatchDraftForJob`
on job creation, and the multi-provider + credential-encryption foundation that CF-23.1 depends on.
Per §2.3, autonomy is built but should not run on a real tenant until this observability layer
exists.
