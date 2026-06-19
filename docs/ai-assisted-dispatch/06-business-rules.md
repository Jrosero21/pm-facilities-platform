# AI-Assisted Dispatch — Business Rules

## R1. Eligibility is a hard floor the scorer never crosses
The scorer ranks ONLY the already-eligible candidate set produced by the matcher
(trade match, geographic coverage, current compliance, not-blocklisted). It
never sees an ineligible vendor and cannot dispatch to one. The LLM likewise
only ever sees two already-eligible candidates.

## R2. Pick priority (strict ladder)
1. Preferred vendor for the location — dispositive whenever eligible.
2. Track record — volume-shrunk completion rate.
3. Trade-fit / geo tightness / name — inherited matcher order.
A preferred vendor with NO track record still wins over a non-preferred vendor
with a strong record.

## R3. Track record fairness
- Completion rate is the only weighted track-record signal (the one with dense
  data). Scale 0..100 ÷ 100.
- Volume confidence: a thin record is shrunk toward neutral (0.5); a vendor with
  one perfect job cannot outrank one with many strong jobs.
- No record for the job's trade ⇒ treated as unproven (neutral 0.5), not zero:
  ahead of proven-weak, behind proven-strong.

## R4. The LLM tiebreaker is bounded
- Fires ONLY on a deterministic close call (top two within the track-record
  epsilon AND not already separated by preference).
- Picks EXACTLY one of the two close candidates; an out-of-pair pick is rejected
  and the deterministic leader stands.
- Emits NO numbers (schema has no numeric field) — it never prices, scores, or
  ranks; it makes one semantic-fit judgment.
- Low confidence ⇒ deterministic leader stands (unless explicitly opted in).

## R5. Firing is gated three ways
The LLM call happens only if: closeCall AND the per-tenant `tiebreakerMode`
permits (default `autonomy_only` ⇒ requires tenant autonomy on) AND the tenant
token ceiling has headroom. Any false ⇒ no spend ⇒ deterministic ranking.

## R6. The autonomy gate is unchanged
The tiebreaker only decides WHICH vendor is drafted. Whether that draft is
auto-SENT vs held for review is the existing `dispatch_router_v1` policy +
spend/token gate, untouched. With autonomy off, every dispatch is still drafted
and held — the tiebreaker can run (if mode permits) but nothing auto-sends.

## R7. Never silent
Every re-rank writes the full ranking to the auto-draft audit log. Every
tiebreaker firing opens its own `dispatch_tiebreaker_v1` run (model, tokens,
rationale, whether it changed the pick) and records the outcome in the audit
metadata. Autonomy shifts review from before-every-item to inspectable-after.

## R8. Non-overridable guardrails sit above policy
The token ceiling (and the kill switch, via the resolver) cannot be overridden
by `tiebreakerMode`. A tenant cannot configure the tiebreaker to spend past the
ceiling.
