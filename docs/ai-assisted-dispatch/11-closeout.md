# AI-Assisted Dispatch Closeout — LLM Tiebreaker for Vendor Dispatch

> Repo naming note: the roadmap labels this work "Phase 27 — AI-Assisted
> Dispatch (Tier 3)." In THIS repo, `phase-27-proposal-agent/` and
> `dispatch_router_v1`'s sibling `proposal_generator_v1` already occupy the
> "Phase 27" number (the shipped proposal agent). To avoid the collision this
> work hit mid-build, the feature is named descriptively — "AI-assisted
> dispatch" — everywhere: folder, harness (`check-ai-dispatch.ts` /
> `db:check:ai-dispatch`), agent (`dispatch_tiebreaker_v1`), and comments.
> The roadmap number is a pointer, not the identifier.

## Phase Goal
Add the Tier-3 "smart picker" to dispatch: a deterministic score over the
already-eligible vendor set, with an LLM acting ONLY as a semantic-fit
tiebreaker on genuinely close calls — never the primary chooser. The
deterministic ranking must stand alone whenever the LLM is unavailable, over
budget, off, or low-confidence.

## Completed Deliverables
- Deterministic dispatch scorer (`src/server/scorer.ts`): ranks the eligible
  candidate set by the tenant-confirmed priority — (1) preferred vendor for the
  location (dispositive when eligible), (2) track record (volume-shrunk
  completion rate), (3) trade-fit/geo/name (inherited matcher order).
- Volume-confidence shrink: a thin record is pulled toward a neutral prior (0.5)
  so a one-job-perfect vendor cannot leapfrog a fifty-job-strong one; an
  unproven vendor sits at the neutral middle (ahead of proven-weak, behind
  proven-strong).
- Track-record adapter (`toScoredCandidate`): reads `completion_rate` (0..100,
  ÷100) joined per `(vendor, job's primary trade)`; absent row ⇒ unproven ⇒ prior.
- Re-rank wired into the live auto-dispatcher (`src/server/auto-dispatch.ts`):
  the placeholder `candidates[0]` is replaced by the scored ranking; the full
  ranking is recorded to both the audit log and the governance decision metadata.
- LLM tiebreaker agent `dispatch_tiebreaker_v1`: own LLM helper
  (`dispatch-tiebreaker/llm.ts`), pure decision logic (`decide.ts`), own
  agent run for clean provenance. Number-free by schema construction
  (vendorId + confidence enum + rationale only). Fires ONLY on a deterministic
  close call, only over the two close candidates, validated back to the pair
  server-side.
- Per-tenant firing mode (`tiebreakerMode`, stored in agent policy JSON):
  `autonomy_only` (default), `always_on_close_call`, `off`. Read via
  `resolved.raw`, null-guarded (kill-switch / no-policy ⇒ safe default).
- Pre-spend guardrail: the tiebreaker checks the tenant token ceiling BEFORE
  the LLM call; over-budget ⇒ skip ⇒ deterministic ranking stands.
- Seeded platform defaults (sandbox): `dispatch_tiebreaker_v1` prompt +
  policy default; `tiebreakerMode: "autonomy_only"` added to `dispatch_router_v1`'s
  existing policy (preserving `requiresReview`).
- Prod-write guard added to `db/seeds/agent-config.ts` (defaults to sandbox;
  prod requires explicit `SEED_ALLOW_PROD=1`).
- Acceptance harness `scripts/check-ai-dispatch.ts` (`db:check:ai-dispatch`).

## Files Created or Changed
Created:
- `src/server/scorer.ts`, `src/server/scorer.harness.ts`
- `src/server/agents/dispatch-tiebreaker/llm.ts` (+ `llm.harness.ts`)
- `src/server/agents/dispatch-tiebreaker/decide.ts` (+ `decide.harness.ts`)
- `scripts/check-ai-dispatch.ts`
- `docs/ai-assisted-dispatch/*` (this set)
Changed:
- `src/server/auto-dispatch.ts` (re-rank + hoisted policy/ceiling resolve + tiebreaker firing + ranking/tiebreak audit metadata)
- `src/server/analytics/vendor-performance.ts` (added `getVendorPerformanceScoresForVendors` batch reader; existing reader untouched)
- `src/server/agents/registry.ts` (added `dispatch_tiebreaker_v1`)
- `db/seeds/agent-config.ts` (prod-write guard; tiebreaker prompt const; AGENT_SEEDS entry; idempotent `dispatch_router_v1` policy UPDATE)

## Database Changes
- NONE (no migration). All data changes are platform-default SEED data in
  `ai_prompt_template_defaults` and `agent_policy_defaults`, landed via the
  idempotent seed (sandbox only so far — see Carry-Forward). Latest migration
  remains 0054.

## API Routes / Server Actions Added
- NONE. The feature is internal to the existing `autoDispatchDraftForJob`
  server path; no new route or public action. Invoked via the existing dispatch
  trigger + the harness.

## User-Facing Workflows Added
- None operator-facing in this phase (no new screen). The re-rank and tiebreak
  are recorded to the audit log / decision metadata for the existing review and
  observability surfaces to read. (Operator-facing surfacing of the ranking
  rationale is a candidate for a later UI phase.)

## Admin/Internal Workflows Added
- Per-tenant `tiebreakerMode` selection (autonomy_only / always_on_close_call /
  off), set in agent policy JSON via the resolver ladder (tenant → default).
- `SEED_ALLOW_PROD=1` gated seed run to land platform defaults in production.

## Business Rules Added
- Vendor pick priority: preferred-for-location (dispositive when eligible) →
  track record → trade-fit/geo/name. A preferred vendor with no record still
  beats a non-preferred strong record.
- Track record = completion rate only (the one dense signal). `avg_rating` is
  unpopulated and `on_time_rate` is too thin in current data to weight; both are
  built as dormant inputs that switch on when data lands.
- The LLM may only reorder the two close candidates; it can never reach a third
  vendor, emit a number, or override a pick that preference or track record
  already settled. Low LLM confidence ⇒ deterministic leader stands.
- The tiebreaker fires only when: close call AND per-tenant mode permits AND
  token ceiling has headroom. Any false ⇒ no LLM spend ⇒ deterministic ranking.
- Autonomy-never-silent: every re-rank and every tiebreak writes its provenance
  (the tiebreaker as its own `dispatch_tiebreaker_v1` run) and audit metadata.

## Chatbot Knowledge Added
- `dispatch_tiebreaker_v1` exists as a production agent: an LLM semantic-fit
  tiebreaker that fires only on close dispatch calls, picks within a two-vendor
  pair, is number-free, and degrades to the deterministic ranking.
- "AI-assisted dispatch" is the descriptive name for this capability; repo
  "Phase 27" refers to the proposal agent, a different shipped feature.

## Verification Performed
```bash
# Offline (no DB, no network):
pnpm exec tsx src/server/scorer.harness.ts                                   # 17/17
pnpm exec tsx --conditions=react-server src/server/agents/dispatch-tiebreaker/llm.harness.ts     # 6/6
pnpm exec tsx --conditions=react-server src/server/agents/dispatch-tiebreaker/decide.harness.ts  # 13/13
pnpm exec tsc --noEmit                                                        # exit 0
# Sandbox (jonnyrosero_pm_sandbox only; self-seeding, self-teardown):
pnpm run db:check:ai-dispatch                                                 # 33/33
#   S1 re-rank fires + thin-perfect loses; S2 preferred-no-record wins;
#   S3 close-call flag + autonomy-off ⇒ tiebreaker does NOT fire (no AI spend);
#   S4 firing-enabled + autonomy-off ⇒ tiebreaker fires (own run, mock model,
#      0 tokens), deterministic leader retained, router still drafted_pending.
# Seed idempotency: pnpm db:seed:agent-config run twice ⇒ no dupes, UPDATE "already set".
```

## Known Limitations
- The real (non-mock) LLM path is exercised only structurally. The harness runs
  with keys unset (mock) to stay deterministic and free; the path where the LLM
  actually selects the runner-up requires a real API key and is a manual probe
  (see Carry-Forward).
- Platform defaults exist in SANDBOX only. In prod, `resolveActivePrompt`
  throws `NoActivePromptError` for `dispatch_tiebreaker_v1` until the gated
  `SEED_ALLOW_PROD=1` seed is run; the default offline mock path is unaffected.
- Proximity is not a live signal (no client-location coordinates compared;
  CF-22.1). Vendor rate/cost is not a live signal (`vendor_rates` empty). Both
  are dormant scorer inputs, not defects.
- `on_time_rate` and `avg_rating` are not yet weighted (thin / unpopulated).

## Carry-Forward Items
See `closeout-carryforwards.md` in this folder.

## Recommended Next Phase Focus
- Operator-facing surfacing of the ranking + tiebreak rationale (read the audit
  metadata into the review/observability UI).
- When a prod LLM key is cut over: run the gated prod seed, then the manual
  real-key tiebreak probe.
- Phase 28 territory: auto-response escalation (re-dispatch to ranked vendor B
  on decline/ghost) — the scorer's full ranking is already the fallback chain.
