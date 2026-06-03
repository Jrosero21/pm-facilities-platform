# Phase 23 — Phase Summary

## Goal

Extend the binary, in-code `{requiresReview}` gate (Phase 7) into a **per-tenant, per-agent
autonomy policy** with a **non-overridable guardrail layer**. Before Phase 23, every agent
always queued its output for operator review — there was no way for a tenant to say "this
agent may act on its own, within these limits." Phase 23 builds the engine that decides
**whether an autonomous action may fire**, and the metering that **caps what autonomy may
commit**, without removing the operator's ability to revert everything instantly.

The first concrete autonomous action governed is **rule-based auto-dispatch** (the Phase-22
`autoDispatchDraftForJob` mechanism): the gate decides whether a created DRAFT may
auto-advance to SENT.

## MVP granularity

**Per-agent on/off**, not a condition vocabulary. A tenant turns an agent's autonomy on
(`autonomyEnabled: true` in its policy) or leaves it off (the default). There is **no**
"auto-execute when confidence ≥ X and trade = Y" rule language — that richer condition
vocabulary is **Phase 28**. Phase 23's job is the safe on/off switch plus the spend ceilings,
not the conditional grammar.

## What shipped

- **Kill switch (resolver step 0).** A tenant-level `kill_switch` checked at the very top of
  `resolveAgentPolicy`, above all policy: when on, every agent resolves to gated for that
  tenant, winning over any per-agent opt-in. One control reverts all autonomy.
- **Per-agent on/off** via `autonomyEnabled` in the policy JSON, resolved through the existing
  ladder (per-client → per-tenant → platform default → fail-safe).
- **Guardrails, compute-on-read (no accumulator table):**
  - **Token meter** — `withinTokenCeilings`: sums all tenant LLM tokens (rolling 24h + lifetime)
    from `agent_runs` against `max_llm_tokens_per_day` / `max_llm_tokens_per_tenant`.
  - **Dollar meter** — `withinSpendCeilings`: sums committed NTE (`getEffectiveNte`) across the
    tenant's autonomy-committed (SENT, NULL-creator) jobs against `max_committed_per_job` /
    `per_day` / `per_tenant`.
- **DRAFT→SENT auto-advance** — `autoDispatchDraftForJob` now composes resolver + both guards
  and, when permitted, calls `sendDispatch({ actorUserId: null })` (the NULL system actor) to
  fire the first real autonomous send.
- **First enforcement dispositions** — the synthetic-run provenance path writes the
  **first-ever `auto_executed` and `policy_blocked`** rows in `agent_decisions`.

## Scope boundaries

- **One migration: 0046** (`tenant_autonomy_settings` — the single guardrail home). No other
  schema; `agent_runs` / `agent_decisions` are reused for provenance.
- **No live trigger.** `autoDispatchDraftForJob` is callable but invoked by **nothing** in app
  code (only the harness). The job-creation trigger and first real-tenant enablement are gated
  behind **Phase 24 observability** (§2.3 permission ≠ readiness).
- **Fail-safe-off default.** The platform default policy is `{requiresReview:true}` with no
  `autonomyEnabled` — so absent any tenant action, nothing auto-advances.

## Verification

`pnpm db:check:autonomy` (new `scripts/check-phase-23.ts`) — **30/0 green from a fresh
file-read**; `pnpm db:check:dispatch` (Phase 22) re-confirmed **30/0** under the governed
vocabulary. See `06-business-rules.md` for the invariant→assertion map and `11-closeout.md`.
