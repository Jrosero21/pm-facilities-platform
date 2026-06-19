# AI-Assisted Dispatch — Carry-Forward Bank

> The canonical post-MVP bank is the live `closeout-carryforwards.md` in the
> latest phase folder; these items roll forward into it. Items here are specific
> to AI-assisted dispatch.

## CF-AID.1 — Land platform defaults in PROD (gated)
The `dispatch_tiebreaker_v1` prompt + policy defaults, and the
`dispatch_router_v1` `tiebreakerMode` key, exist in SANDBOX only. The non-mock
LLM path in prod throws `NoActivePromptError` until landed.
ACTION (gated, irreversible-class): `SEED_ALLOW_PROD=1 pnpm db:seed:agent-config`.
NOTE: that run ALSO backfills `proposal_generator_v1` / `invoice_creator_v1`
prompt defaults if prod is missing them (idempotent) — confirm the full set it
touches before running. Do when cutting over to a real prod LLM key.

## CF-AID.2 — Manual real-key tiebreak probe
The harness proves the machinery (fires, records, degrades, respects the gate)
on the MOCK path. The path where the live LLM actually selects the runner-up
needs a real API key and is NOT harness-reachable. ACTION: a one-off manual
probe with a real key against a sandbox close-call job, confirming a genuine
semantic-fit swap + rationale, before trusting live AI picks in production.

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
