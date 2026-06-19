# AI-Assisted Dispatch — Chatbot Knowledge

## Capability
The platform ranks eligible vendors for a job deterministically (preferred-for-
location → track record → trade-fit) and uses an LLM ONLY to break genuine
close calls between two near-equal eligible vendors. The LLM never chooses
outside that pair, never emits numbers, and never overrides a pick that
preference or a clear track-record gap already settled.

## Agent
`dispatch_tiebreaker_v1` — "Dispatch Tiebreaker." An LLM semantic-fit
tiebreaker. Fires only on a deterministic close call; picks the better
specialization fit within the two-vendor pair; number-free; degrades to the
deterministic ranking when unavailable, over token budget, off, or low-confidence.
Per-tenant firing mode (`autonomy_only` default).

## Key facts
- Track record currently = completion rate (the dense signal). On-time and
  rating are built but unweighted (thin/unpopulated). Distance and price are
  dormant scorer inputs (no data yet; CF-22.1 / empty vendor_rates).
- The tiebreaker decides WHICH vendor is drafted; the existing autonomy gate
  decides draft-vs-send. With autonomy off, nothing auto-sends.
- Every re-rank and tiebreak is logged (autonomy-never-silent).
- "AI-assisted dispatch" is the descriptive feature name; repo "Phase 27" is the
  proposal agent (different feature).

## Limits to state honestly
- The live LLM "actually swaps to vendor B" path is verified structurally only
  (mock); a real-key manual probe is pending (CF-AID.2).
- Platform defaults are seeded in sandbox; prod needs the gated seed (CF-AID.1).
