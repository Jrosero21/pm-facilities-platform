# Phase 26 — Admin SOP

Operating the invoice creator at the tenant/platform level.

## Default posture: gated

`invoice_creator_v1` is **fail-safe gated**. The phase seeds an `ai_prompt_template_defaults` row
(so the agent has a system prompt) but **no `agent_policy_defaults` row**. `resolveAgentPolicy`
therefore resolves `{ requiresReview: true }` for every tenant — the agent **always** queues its
draft for review. There is no auto-execute path in the code regardless of policy.

## Seeding the prompt default

The system prompt lives in `db/seeds/agent-config.ts` (the same source-of-record as the rewriter and
scope prompts) and is applied by `pnpm db:seed:agent-config` (idempotent — existing rows are left
as-is). The prompt instructs the model to write client-facing line descriptions only, to **never
output amounts**, to set `reconcilesToVendorLineId` per line, and to judge `lumpFlag`. A
behavior-affecting edit bumps the row's version; the version is recorded on `agent_runs.prompt_version`.

## The mock path (dev / harness)

Set `INVOICE_CREATOR_MOCK=1` (or the global `AGENT_MOCK=1`) to force the deterministic mock — it skips
the LLM and the DB prompt resolution and returns a fixed object with no numbers. The phase-blocking
harness (`db:check:invoice`) uses this to drive the real number-join over seeded vendor fixtures.

## Enabling autonomy — NOT done this phase

The agent is governable by the Phase-23 policy ladder, but **autonomy is not enabled and should not
be** as part of Phase 26. Two things are missing by design:

1. A **Phase-23 policy** that opts a proven tenant in (`autonomyEnabled:true` + cleared guardrails) —
   none is seeded; absence means gated.
2. A **live trigger** — nothing in app code invokes `runInvoiceCreator` except the operator action.
   The "invoke on submit / on completion" trigger is unwired (**CF-24.2**, §2.3 — permission ≠
   readiness). Flipping autonomy without observability evidence is explicitly out of scope.

## Observability

The agent surfaces in the Phase-24 `/agents` evidence with no extra wiring for volume, cost,
dispositions, failures, and latency (those readers GROUP BY `agent_id`). Approve-as-is surfaces via
the `invoiceApproveAsIs` adapter added this phase. Use that evidence — not a calendar — to decide if
the agent is ever a candidate for autonomy.

## Migration / DB ops

Migration **0047** (`0047_military_lucky_pierre.sql`) created `invoice_drafts` + `invoice_reviews`
and is **already applied to prod** (119 → 121 tables, contract + FK verified). Follow the standing
migration cadence for any future change: sandbox apply → `-E` contract-verify → prod-confirm gate →
prod apply; confirm the resolved DB name before any prod DDL (a pre-set shell `DATABASE_URL` survives
drizzle-kit's env load).

## Harness

`pnpm db:check:invoice` (`scripts/check-phase-26.ts`) is the phase-blocking acceptance proof. It is
**sandbox-only** (forces `*_sandbox`, refuses otherwise), self-seeds a fresh `phase26-harness-tenant`,
and tears down by tracked id under `FK_CHECKS=0`. Note the new teardown corollary: because the agent
is actually invoked under mock, its runs write `agent_tool_calls` + `agent_decisions`, and under
`FK_CHECKS=0` cascade does **not** fire — those child rows are deleted explicitly by `agentRunId`.
