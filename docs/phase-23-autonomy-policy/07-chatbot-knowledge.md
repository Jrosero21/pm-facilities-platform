# Phase 23 — Chatbot Knowledge

Curated knowledge for the future Phase-16 operations chatbot to answer autonomy questions
accurately. Written as ground truth the bot can paraphrase.

## What "autonomy" means in this platform

Autonomy = whether an agent may **act on its own** (take a real action) versus only **draft for
operator review**. Before Phase 23, every agent always drafted for review (the binary
`{requiresReview}` gate). Phase 23 added a **per-tenant, per-agent on/off switch** plus
**non-overridable spend guardrails**, and wired the first autonomous action: **rule-based
auto-dispatch** auto-advancing a DRAFT to SENT.

Granularity is **per-agent on/off** — there is no "act when condition X" rule language yet (that
is Phase 28). A tenant either enables an agent's autonomy or leaves it off (the default).

## The agents (registry)

Production agents: **`update_rewriter_v1`**, **`scope_generator_v1`**, **`chatbot_assistant_v1`**,
and **`dispatch_router_v1`** (added in Phase 23 — rule-based Tier-2 auto-dispatch; **no LLM, no
prompt template**). `test_stub_v1` is test-only. The LLM agents draft for review; only
`dispatch_router_v1` has an auto-advance path, and only when its tenant has enabled it within
guardrails.

## How gating works — `autonomyEnabled` has THREE composed halves

An autonomous action fires only when **all three** pass:
1. **Policy half** — `resolveAgentPolicy(...).autonomyEnabled === true` (an explicit tenant opt-in,
   resolved per-client → per-tenant → platform default → fail-safe).
2. **Kill-switch half** — also inside the resolver as **step 0**: the tenant's `kill_switch` must be
   off (if on, everything is gated, above all policy).
3. **Guardrail halves** — composed at the **enforcement site** (not in the resolver):
   `withinTokenCeilings(tenant).ok` **and** `withinSpendCeilings(tenant, job).ok`.

So: `permitted = resolved.autonomyEnabled && tokenOk && spendOk`. The `autonomyEnabled` *field* on
the resolved policy reflects only halves 1+2 (policy + kill-switch); the token + spend halves are
ANDed where the action is taken. (The field name is a known clarity wrinkle — see
`10-known-limitations.md`.)

## Dispositions (what each decision means)

- **`auto_executed`** — autonomy fired: the draft was auto-advanced to SENT within policy +
  guardrails. (First emitted in Phase 23.)
- **`policy_blocked`** — autonomy was held back; the draft awaits operator review. A `blockedBy`
  reason says which gate stopped it: `not_enabled`, `kill_switch`, `token_ceiling`, `spend_ceiling`,
  or `unmeasurable_nte`. (First emitted in Phase 23.)
- **`queued_for_review`** — the LLM agents' normal disposition; in Phase 23 also used (with a
  *failed* run) when a permitted auto-send threw — the draft awaits a human.

## The guardrails (compute-on-read)

No accumulator table — the meters sum live from source rows at check time:
- **Token ceiling** — sums **all** the tenant's LLM tokens (rolling 24h + lifetime) from
  `agent_runs`, against `max_llm_tokens_per_day` / `_per_tenant`.
- **Dollar ceiling** — sums committed NTE across the tenant's SENT system-actor dispatches
  (WORK_COMPLETE counts; DECLINED/CANCELLED don't) against `max_committed_per_job` / `_per_day` /
  `_per_tenant`. A job with no NTE is **unmeasurable → blocked**.
- A cap blocks **at-or-above** its value. A NULL cap = no limit. The kill switch overrides all.

## The no-live-trigger state (important)

As of Phase 23, **nothing in the app automatically invokes** the auto-dispatch path —
`autoDispatchDraftForJob` is a callable mechanism exercised only by the harness. A live trigger and
an observability dashboard are **Phase 24** (§2.3: having permission to act ≠ being ready to act
unwatched). So even a fully-enabled tenant sees no autonomous sends until Phase 24 wires the
trigger. The fail-safe-off default means absent any tenant action, nothing auto-advances regardless.
