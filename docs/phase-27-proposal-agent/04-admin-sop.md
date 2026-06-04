# Phase 27 — Admin SOP

Configuring, governing, and verifying `proposal_generator_v1`.

## Agent configuration

- **Registry.** `proposal_generator_v1` is registered (`src/server/agents/registry.ts`):
  `inputSourceTypes: ["job"]`, `outputType: "proposal_draft"`, `testOnly: false`.
- **Prompt (fail-closed).** The real (non-mock) path resolves the active prompt from
  `ai_prompt_templates` (tenant → platform default). If neither resolves it **fails closed**
  (`NoActivePromptError` → the run records `status='failed'`); seed an
  `ai_prompt_template_defaults` row for the agent so the real path has a prompt.
- **Policy (fail-safe gated).** With **no** `agent_policy_defaults` row seeded for the agent,
  `resolveAgentPolicy` returns `{ requiresReview: true }`. The agent therefore **always queues** — and
  it has no auto-execute path regardless. Enabling autonomy is **not** done this phase (needs a
  Phase-23 policy **and** a live trigger that does not exist — CF-24.2).
- **Mock toggle.** `PROPOSAL_GENERATOR_MOCK=1` (or `AGENT_MOCK=1`) forces a deterministic, number-free
  mock draft and skips the DB prompt + provider call. `PROPOSAL_GENERATOR_MODEL` overrides the model;
  defaults match the invoice creator (`anthropic/claude-sonnet-4-6`).

## NTE configuration to verify (the gate basis)

- The send-gate compares the proposal total to the **client/job** effective NTE:
  `getEffectiveNte(tenantId, jobId)` = `jobs.not_to_exceed_amount` (the creation snapshot) + Σ approved
  change-order totals. This is **not** the vendor `agreed_nte_amount` axis.
- The job NTE snapshots at job creation from `client_nte_rules` via the **A4/A5 ladder**, with the
  **HANDY** (general) fallback resolving when no specific trade×urgency rule matches. Verify a client
  has either specific rules **or** a HANDY default — otherwise the job NTE is **null**, and every
  proposal on that job fail-safes to **client** (never internal).

## Markup configuration

- Published-line markup is the client's billing-rule default (`resolveClientMarkupDefault`), resolved
  **once** at publish and applied to every line. With no rule, markup is `null` (no uplift). Seed the
  client billing rule to bill markup.

## Observability (Phase-24)

- Volume / disposition / cost / failures / latency surface automatically (GROUP BY `agent_id`) once the
  agent produces runs — no per-agent wiring.
- **Approve-as-is** has a dedicated adapter: `proposalApproveAsIs` — counted as **approve AND the
  operator kept the phrasing ~as-is** (phrasing edit-distance ≤ the gold threshold). It appears as the
  5th row of `agentApproveAsIs` (`applicable: true`). Note this is a *phrasing* metric, not "no edit" —
  proposal edits always carry numbers.

## Feedback (Phase-25)

- `proposalCorrectionPairs` classifies operator corrections by **phrasing edit-distance** (numbers
  stripped). Thresholds (`PROPOSAL_PHRASING_GOLD_MAX = 0.15`, `PROPOSAL_PHRASING_NEGATIVE_MIN = 0.5`)
  are conservative MVP defaults, single-sourced in `src/server/analytics/proposal-phrasing.ts` —
  tune them once real review volume accumulates (Phase-25 calibration). Few-shot examples are
  number-free by construction.

## Verification

- **`pnpm db:check:proposal`** (`scripts/check-phase-27.ts`) — **sandbox-only**, hard-guarded (rewrites
  the DB URL to `*_sandbox`; **exits 2** if the resolved URL is not a sandbox). Self-seeds a fresh
  tenant and tears it down by tracked id under `FK_CHECKS=0`. **15/0** — money-safety (M1–M4, incl. the
  fail-closed `ProposalRequiresPricing`), NTE gate (N1–N4 incl. the `internal_billed` event),
  idempotency (I1), harvest (H1–H3), approve-as-is (A1), volume (V1). Uses the **env mock**
  (`PROPOSAL_GENERATOR_MOCK=1`) — no `PROVIDER_REGISTRY` override (that is the Phase-25-only pattern).
- **`pnpm db:check:feedback` (13/0)** and **`pnpm db:check:observability` (28/0)** stay **unchanged** —
  both are tenant-isolated, so the new proposal roster/aggregate entries are empty for their seed
  tenants.

## Migration 0048 (summary)

`0048_glorious_iron_patriot.sql` — `proposal_drafts` + `proposal_reviews` (FK parity with the invoice
pair); `proposals.kind enum('client','internal') NOT NULL DEFAULT 'client'`; `status` gains
`internal_billed`; a composite `prop_tenant_kind_status_idx (tenant_id, kind, status)` (the older
`prop_tenant_status_idx` retained). Applied to prod via the sandbox → `-E` contract-verify →
prod-confirm cadence (121 → 123). Full detail in `08-db-changes.md`.
