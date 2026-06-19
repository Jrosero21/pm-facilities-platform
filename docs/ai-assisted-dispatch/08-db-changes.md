# AI-Assisted Dispatch — Database Changes

## Schema changes: NONE
This work added no tables and no columns. The latest migration remains 0054;
no new migration was created. This is deliberate: the feature is internal
server logic plus reference/seed data, not a schema change.

## Data changes (platform-default SEED, not migration)
Per house convention, agent-default data lives in `db/seeds/agent-config.ts`
(idempotent), NOT in numbered migrations (which carry zero data DML in this repo).
The seed adds, into existing tables:
- `ai_prompt_template_defaults`: one row for `dispatch_tiebreaker_v1`
  (variant default, v1, active, model_hint anthropic/claude-sonnet-4-6,
  temperature 0.30, the number-free tiebreaker system prompt).
- `agent_policy_defaults`: one row for `dispatch_tiebreaker_v1`
  (`{"requiresReview":true,"tiebreakerMode":"autonomy_only"}`).
- `agent_policy_defaults` for the existing `dispatch_router_v1`: a targeted
  idempotent UPDATE adding `"tiebreakerMode":"autonomy_only"` while preserving
  `requiresReview` (insert-if-absent would not touch the existing row).

## Where the firing mode lives
`tiebreakerMode` rides inside the existing open `policy` JSON column — no new
column. Unknown keys already pass through to the policy resolver's `.raw`, so
no schema or resolver change was required.

## Seeded state
Sandbox only at close. Prod is landed via the gated `SEED_ALLOW_PROD=1` run
(see Admin SOP / CF-AID.1).

## Read path added (no schema impact)
`getVendorPerformanceScoresForVendors(tenantId, vendorIds, tradeId)` — a new
batch reader over the existing `vendor_performance_scores` table (trade-filtered,
one round-trip). The existing per-vendor reader is unchanged.
