# AI-Assisted Dispatch — Carry-Forward Bank

> The canonical post-MVP bank is the live `closeout-carryforwards.md` in the
> latest phase folder; these items roll forward into it. Items here are specific
> to AI-assisted dispatch.

> **Folded in (v2.24.0):** these CF-AID items now live in the canonical bank
> (`docs/phase-27-proposal-agent/closeout-carryforwards.md`, "AI-assisted
> dispatch — banked items" section) — that is the LIVE copy. The entries below
> are retained as the feature-local record; update status in canonical, not here.

## CF-AID.1 — Land platform defaults in PROD (gated)
The `dispatch_tiebreaker_v1` prompt + policy defaults, and the
`dispatch_router_v1` `tiebreakerMode` key, exist in SANDBOX only. The non-mock
LLM path in prod throws `NoActivePromptError` until landed.
ACTION (gated, irreversible-class): `SEED_ALLOW_PROD=1 pnpm db:seed:agent-config`.
NOTE: that run ALSO backfills `proposal_generator_v1` / `invoice_creator_v1`
prompt defaults if prod is missing them (idempotent) — confirm the full set it
touches before running. Do when cutting over to a real prod LLM key.

## CF-AID.2 — Manual real-key tiebreak probe — PROVEN (2025; sandbox, dev key)
The live (non-mock) path is verified end-to-end via `scripts/probe-ai-dispatch-realkey.ts`
(`pnpm run probe:ai-dispatch-realkey`) — a standalone, sandbox-guarded, self-tearing-down
probe that makes ONE real billed Anthropic call. It is deliberately NOT in CI (billed +
non-deterministic); re-run it manually whenever the tiebreaker prompt, model, or firing
logic changes.
RESULT (first run): close-call between a rooftop-RTU specialist (deterministic leader,
completion 80/30) and a ductless split-system specialist (runner-up, 78/30); job problem
described a leaking mini-split. The live model (anthropic/claude-sonnet-4-6, 879 in / 97 out
tokens) correctly SWAPPED to the runner-up — tiebreakSource=llm_tiebreak, changedByLlm=true —
with a rationale naming the equipment-specialization match. The autonomy gate still held
(drafted_pending/not_enabled, autonomy off). Machinery + real semantic swap both confirmed.
FINDING: the LLM's only per-vendor signal today is the vendor NAME (+ a binary primary-trade
flag); name-as-specialization-proxy proved sufficient for a clean match. A richer
specialization profile is nice-to-have, not required (relates to CF-AID.3's dormant inputs).

## CF-AID.3 — Dormant scorer inputs (switch on with data)
Built into the scorer, contributing nothing until data lands — NOT defects:
- Proximity / distance: inert (no client-location coordinates compared).
  Unblocked by CF-22.1 (rich service-area/geocoding) in the canonical bank.
- Vendor rate / cost: `vendor_rates` empty; no cost dimension yet.
- `on_time_rate`, `avg_rating`: present but unweighted (thin / unpopulated).
When the underlying data is captured, these slots weight in without a scorer
rewrite. Tracked here because the LINK between "scorer already shaped for these"
and "blocked on that data/CF-22.1" lives nowhere else.

## CF-AID.4 — Operator-facing rationale surfacing
The ranking + tiebreak rationale are written to audit/decision metadata but not
yet shown in any operator screen. Candidate for a later UI phase (read-only
surfacing of "why this vendor / why the tiebreak went this way").
