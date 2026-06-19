# AI-Assisted Dispatch — Known Limitations

## L1. Real LLM path verified structurally only
The harness runs on the mock path (keys unset) for determinism and zero cost. It
proves the machinery: the tiebreaker fires, opens its run, records provenance,
respects the firing gate, and degrades safely. It does NOT prove the live LLM
actually selecting the runner-up — that needs a real key and is a manual probe
(CF-AID.2).

## L2. Platform defaults sandbox-only
In prod, `resolveActivePrompt` throws `NoActivePromptError` for
`dispatch_tiebreaker_v1` until the gated `SEED_ALLOW_PROD=1` seed runs (CF-AID.1).
The offline mock path is unaffected.

## L3. Track record is single-signal today
Only completion rate is weighted (the dense signal). `on_time_rate` is too
uniform in current data; `avg_rating` is entirely unpopulated. Both are built as
dormant inputs that weight in when data lands — no rewrite needed.

## L4. No live proximity or cost signal
Proximity is inert (no client-location coordinates compared; unblocked by
CF-22.1). `vendor_rates` is empty (no cost dimension). Both are dormant scorer
slots, not defects (CF-AID.3).

## L5. No operator-facing rationale UI
The ranking and tiebreak rationale are recorded to audit/decision metadata but
not surfaced in any screen yet (CF-AID.4).

## L6. Tiebreaker covers the top-two close call only
By design, the LLM only ever arbitrates the top two candidates when they are
within the track-record epsilon. It does not re-rank the whole set or arbitrate
three-way near-ties; the deterministic order governs everything else.
