# B-16.4 — Known Limitations

## L1 — Migration 0054 not prod-applied
Sandbox has `total_dispatches` + `completion_rate`; **prod does not.** The scorer cannot write in prod
until the two direct ALTERs are applied there (gated, see 08-db-changes / 04-admin-sop). Until then,
B-16.4 is validated only in sandbox.

## L2 — The AI-dispatch consumer is still unbuilt
B-16.4 **unblocks** the roadmap's Phase 27 (AI-Assisted Dispatch, Tier 3) — it populates the
`vendor_performance_scores` that dispatch ranking is data-blocked on — but it does **not build** dispatch
ranking. The scores exist and are operator-visible (chatbot); wiring them into an AI/ranked dispatch
recommendation is a separate future phase (depends also on Phase 22 eligibility + Phase 23 policy).

## L3 — No rating capture
`avg_rating` is null and stays null — there is no operator/client rating surface anywhere in the product.
The score is built purely from objective dispatch outcomes (completion + on-time). If a rating-capture
path is ever added, `avg_rating` and a fourth scoring term could be folded in.

## L4 — Validated on synthetic data only
The scorer is proven against the 55-vendor synthetic fixture (known archetype rankings), not real
production history (dev has 1 vendor / 1 completed job). The compute logic is correct and deterministic;
real-world score *quality* will only be observable once production accrues dispatch volume.

## L5 — No scheduled recompute
The populator is invoked programmatically; there is no cron/timer that recomputes scores as new dispatch
activity lands. Scores are as fresh as the last manual/triggered run. A scheduled recompute is a future add.

## L6 — Roadmap §9 over-attribution (note, not a defect)
Roadmap §9 lists *"B-16.4 (Phase 27 data dependency)"* under "retired by v2 phases." In practice B-16.4
shipped as a **standalone sub-feature post-`v2.22.0`**, not as part of `phase-27-proposal-agent` (which
became the proposal generator, not AI dispatch). The §9 wording is loose ("as the surfaces land"), not a
hard false claim, so **no doc-correction CF is opened** — recorded here for accuracy. The live bank's
B-16.4 disposition (retired by this sub-feature) is the source of truth.
