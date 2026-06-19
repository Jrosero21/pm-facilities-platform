# B-16.4 — User SOP (Operator)

## Seeing a vendor's performance
Ask the operator chatbot about a vendor (the `summarizeVendorPerformance` tool). When scores have been
computed for that vendor, the answer includes:
- **Overall score** (0–100, dispatch-weighted across the vendor's trades) — the one-number signal.
- **Completion %** — of all dispatches, how many got done (declines/cancels count against).
- **On-time %** — of completed jobs, how many arrived by the scheduled start.
- **Per-trade breakdown** — score/completion/on-time per trade, so "strong at HVAC, weak at Electrical"
  is answerable.

## Reading the score
- **Higher is better.** The score weights completion more heavily than punctuality (a reliable-but-slow
  vendor outranks a fast-but-flaky one — by design).
- **Thin history is pulled toward the average.** A vendor with only a few dispatches won't show an extreme
  score until they've built a track record — that's intentional (don't over-trust small samples).

## When there's no score
If a vendor has no computed scores yet, the chatbot returns profile-only info with a note that scoring
isn't available for them. This is expected for vendors with no dispatch history, or before the scorer has
run in the environment.

## Who can see it
Any operator using the chatbot, tenant-scoped — a vendor's scores are only visible within their own
tenant.
