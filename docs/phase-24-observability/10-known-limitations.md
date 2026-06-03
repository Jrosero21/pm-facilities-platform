# Phase 24 — Known Limitations

Honest caveats. None block the phase; each is tracked.

## OpenAI path is BUILT but NOT LIVE-PROVEN
`@ai-sdk/openai` + the OpenAI direct path + the failover loop are wired, but with **no
`OPENAI_API_KEY`** OpenAI is **dormant** — it has never made a live call. The candidate-builder
and the retry-vs-rethrow predicate are verified by **logic** (the harness constructs
`APICallError`/`NoObjectGeneratedError` instances and asserts both branches), not by live
traffic. **Real failover** (Anthropic actually fails → OpenAI actually serves) is only proven
once a key is added **and** a provider genuinely fails. Until then, every live run is
Anthropic-direct, exactly as before.

## Live autonomy trigger is UNWIRED (deliberate — CF-24.2)
`autoDispatchDraftForJob` is invoked by nothing in app code. Phase 24 built the observability
evidence the §2.3 gate requires but did **not** flip the trigger — that is a discrete future
decision (CF-24.2), now informable by the `/agents` surface. So the autonomy panel reads
all-zeros today (correct: no autonomous dispatch has occurred), and `auto_executed` /
`policy_blocked` dispositions won't populate from production until the trigger (and a tenant
opt-in) exist.

## Observability prod data is thin
The readers are correct, but production has only a handful of agent runs so far — the `/agents`
page will look sparse until real agent traffic grows. Empty sections render `EmptyState`; the
autonomy panel renders meaningful zeros. This is expected, not a defect.

## Cost-map prices are third-party-sourced
`config/pricing.ts` prices are from third-party trackers as of **Jun 2026** (Anthropic Sonnet
$3/$15 per 1M; OpenAI gpt-5.4 $2.50/$15 per 1M). **Confirm against the providers' official
pricing pages** when keys are added; the exact OpenAI model + its price are a one-line swap in
the map. Cost is reported, not billed — an off price misreports a figure, it does not charge
anyone.

## Dollar-meter O(N) still banked (CF-23.2)
Unrelated to observability cost (which is the LLM token×price reader), the Phase-23 committed-$
guardrail meter (`withinSpendCeilings`) is still O(N) per committed job on the per-tenant
lifetime axis. Fine at current (≈zero) autonomy volume; **CF-23.2** remains banked for when
volume grows.

## Retention surfaces that age out (intended)
After 180 days, two **non-protected** surfaces show cleared content: `getRunTrace` per-run debug
bodies and the review-queue `decisionMetadata` rationale. This is the intended effect of
retention (heavy bodies age out; all summary/cost/disposition/approve-as-is history is
preserved), documented in the retention script header — not data loss of the observability
surface. Currently moot (0 rows are 180 days old).

## `autonomyEnabled` naming + rolling-24h window (inherited soft notes)
The Phase-23 soft notes still stand: `ResolvedPolicy.autonomyEnabled` names only the
policy+kill-switch halves (the full permit ANDs the guardrails at the enforcement site); and
"per-day" everywhere is a rolling trailing 24h, not a tenant-local calendar day. Both carried
forward open.
