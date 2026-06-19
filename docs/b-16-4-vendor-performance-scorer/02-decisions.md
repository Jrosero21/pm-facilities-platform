# B-16.4 — Decisions

## D1 — Completion-dominant composite: 0.7·completion + 0.3·on-time
The operator's call: **getting work done matters more than punctuality.** A vendor who completes 95% of
dispatches but often runs late is more valuable than a punctual one who flakes half the time. The 70/30
split encodes that. Validated: `reliable_slow` (high completion, low on-time) scores 68.8, well above
`flaky_fast` (low completion, good-when-present on-time) at 49.5 — "done-but-late" beats "fast-but-flaky."

## D2 — Declines + cancels count AGAINST (denominator, not numerator)
`completion = completed / total_dispatches`, where total includes declined and cancelled. Operator
rationale: **a decline means the work didn't get done** through that vendor — from the dispatcher's seat
it's a miss, not a neutral event. A vendor who declines half their dispatches is unreliable to dispatch
to, and the score must say so.

## D3 — Shrinkage toward the population mean, K=5
`shrunk = (n·raw + K·popMean) / (n + K)`. A vendor with 2 dispatches at 100% completion hasn't *proven*
100% — they're pulled toward the average until they have a track record. K=5 ≈ "assume ~5 average jobs of
prior belief before trusting the vendor's own record." Without this, thin-history vendors would top or
bottom the rankings on noise. Validated: `newcomer_thin` (small n) lands mid-pack (58.0), not at an
extreme.

## D4 — Status resolution by CODE, not display name
The populator resolves `WORK_COMPLETE` / `ON_SITE` by `dispatch_assignment_statuses.code`, not by the
display `name`. **Survives a banked rename** (e.g. "Declined" → "Vendor Declined") — codes are the stable
canonical key; names are operator-facing and mutable.

## D5 — Unweighted population mean (each vendor×trade group counts equally)
The shrinkage prior is the mean across groups, **not** dispatch-weighted. Rationale: **the prior belief
about "an average vendor" shouldn't be defined by the busiest vendors.** A handful of high-volume vendors
shouldn't drag the average everyone else is shrunk toward.

## D6 — `avg_rating` left null
There is **no rating-capture path** anywhere in the product (no operator/client rating surface). Writing
an invented rating would be dishonest; the column stays null until a capture path exists.

## D7 — Synthetic fixture, not real data
Dev has **1 vendor, 1 completed job** — you cannot design or validate a scorer on n=1. So a deterministic
synthetic world (55 vendors, 6 archetypes with known expected rankings) is the test oracle. The scorer is
validated by asserting it recovers the archetypes' hidden quality ordering. Real scores accrue once the
product runs in production.

## D8 — Per (vendor × trade), idempotent delete-then-insert
Scores are computed per `(vendor_id, matched_trade_id)` — a vendor can be strong at HVAC and weak at
Electrical. The table has no unique key, so the populator is idempotent by **delete-then-insert the
tenant's rows in a transaction** (mirrors the billing `recalculate*` pattern).
