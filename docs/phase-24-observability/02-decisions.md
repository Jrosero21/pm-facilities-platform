# Phase 24 — Decisions

Locked decisions with rationale. Validated against live code + the 28/0 harness.

## Sequencing & scope
- **Track order A → C → B.** Observability first (the readiness evidence), then retention
  (storage hygiene over the same tables), then multi-provider/failover (the heaviest). Each
  track is independently committed.
- **No schema, 0047 untouched, all of Phase 24.** Observability needs no new column/table
  (24a); cost reuses `agent_runs.model`+tokens; preference reuses `agent_policies` JSON;
  retention clears existing longtext columns. The phase is read + code only.

## Live-trigger fork — DEFERRED (CF-24.2)
The live job-creation trigger that would invoke `autoDispatchDraftForJob` is **not wired**.
Rationale: §2.3 — *permission ≠ readiness*. Phase 24 builds the evidence surface; autonomy
must be observable-and-proven before it is reachable. Wiring the trigger is now a discrete,
evidence-informed future decision (**CF-24.2**), not an oversight.

## Observability (track A)
- **Dedicated `/agents` page, not a dashboard section.** Agent observability is its own
  operator surface; mixing it into the operational dashboard would dilute both.
- **Page-layer gating via `canSeeOperations`** — no new role predicate. Readers enforce
  tenant-scoping only; the page (`requireTenant` + `canSeeOperations`) is the gate (matches
  the dashboard convention).
- **Numeric cards + tables, no charting library.** The portal has no charts and no charting
  dependency; observability stays consistent (distributions render as p50/p90/mean text).
- **Approve-as-is is NOT uniform → per-agent adapters.** There is no unified review table;
  rewriter reads `update_rewrite_reviews.edited_content` (text), scope reads
  `job_scope_reviews.edited_steps` (json). `dispatch_router_v1` has no review surface →
  reports **"N/A" (rule-based, no review step), NEVER 0%** (a 0% would be a misleading trust
  signal). Latest-review-per-draft dedupe (a re-reviewed draft counts once, latest wins).
- **Cost = compute-on-read.** A `config/pricing.ts` model→price map over the existing
  `agent_runs.model` + token columns; **group by (agentId, model)** (price varies by model);
  **null-model and unknown-model rows are EXCLUDED** (unmeasurable, NOT $0 — the cost analogue
  of the two-NULLs rule).

## Multi-provider + failover (track B)
- **Direct-SDK path** (the app calls Anthropic directly via `@ai-sdk/anthropic`, no gateway).
  **OpenAI added (`@ai-sdk/openai`) but DORMANT** — with no `OPENAI_API_KEY` it is simply
  unavailable, never an error. Default failover order **Anthropic → OpenAI**; `openai/gpt-5.4`
  seeded as the OpenAI default.
- **Providers are DATA, not structure.** `PROVIDER_REGISTRY` (name → env key, SDK factory,
  recorded prefix, default model) means a third provider is one map entry + one pricing entry,
  no logic change.
- **Failover retries TRANSPORT errors only.** `isProviderTransportError` retries the next
  candidate on `APICallError` with `isRetryable` or status ∈ {408,409,429,5xx}; it **rethrows
  immediately** on a legitimate agent error (`NoObjectGeneratedError` / `TypeValidationError`
  / refusal) — failing over on a real error would just burn the second provider. (Exact `ai@6`
  classes confirmed at build time.)
- **`recordedModel` = the provider that ACTUALLY ran** (set per-iteration), so
  `agent_runs.model` + the cost/volume readers stay truthful under failover.
- **Preference is ALLOWLIST + ORDER, not a floor.** Only the providers the preference lists
  (and that are available) are tried, in order; no auto-append of unlisted providers. The one
  fail-safe exception: an empty/absent/all-unavailable preference falls back to the single
  env-driven base (today's behavior) — a bad preference must never hard-fail a tenant.
- **Preference lives in `agent_policies` JSON** (`failoverOrder` = ordered provider-qualified
  model strings), read via the resolver's existing `resolved.raw` — **no resolver change**;
  per-client → per-tenant → default precedence is free from the existing ladder.
- **CF-23.1 boundary held.** Provider *preference* is built now using the **platform's** env
  keys; tenant-supplied *key storage* + the Settings UI remain deferred behind **CF-12.4**
  (credential encryption-at-rest). No tenant-key storage was built.

## Retention (track C)
- **180 days, NULL-not-delete, GLOBAL-by-age.** Clears exactly `agent_tool_calls.tool_input`,
  `tool_output`, and `agent_decisions.metadata` to NULL — never deletes rows (CASCADE-FK
  safety: deleting `agent_runs` would wipe decisions/tool_calls/drafts/reviews). All
  summary/cost/disposition history is preserved.
- **DB-side age predicate** (`created_at < NOW() - INTERVAL 180 DAY`), **never a JS Date** (the
  JS-Date-vs-DB-timezone bug class). **Idempotent** via `AND payload IS NOT NULL` (already-NULL
  rows skipped).
- **Prod-capable script following the `db/seeds` precedent, NOT the check-script
  sandbox-forcing guard.** Rationale (recorded deviation): a retention tool exists to clear
  **prod** payloads; copying the check-scripts' rewrite-to-`_sandbox`-or-refuse guard would
  make it structurally unable to do its job. Safety is instead: **dry-run default** (reports
  eligible counts, writes nothing) + a loud target-DB print + explicit `--apply`.
- **`countEligibleAgentPayloads()` extracted into `src/server/agents/retention.ts`** so the
  script and the harness share ONE predicate (behavior-preserved — dry-run output identical
  pre/post extraction).

## Harness
- **Dedicated fresh `phase24-harness-tenant`** for exact, isolated counts (not
  `phase9-seed-tenant`, which holds pre-existing agent rows that would make counts brittle).
- **Teardown by tracked id, under `FK_CHECKS=0`, children-first, NEVER by timestamp.**
- **`export {};` header** — module isolation (the CF-24.1 lesson; without it the harness's
  global `main()` collides).

## CF-24.1 (recorded so the mislabel isn't repeated)
The TS2393 "Duplicate function implementation" was **NOT pre-existing** — it was introduced by
the 24d-B retention script shipping as a bare global script (no `export {};`), whose top-level
`main()` collided in global scope with `check-external-integrations.ts`'s `main()`. Fixed at
`435441f` by `export {};`-isolating both scripts. The 24d-B report's "pre-existing" label was
wrong; this is the corrected record.
