# Phase 25 — Known Limitations

All are deliberate scope boundaries, banked as CF-25.x (see `closeout-carryforwards.md`). None block
the phase; each is recorded so it is not mistaken for an oversight.

## Thin live data — machinery proven on a seeded corpus only
The platform currently has **1 gold pair** (scope), a handful of positives, and **zero rejects**. That
is far too little to demonstrate, let alone measure, a real quality lift. The phase-blocking harness
therefore proves **plumbing + measurability on a seeded synthetic corpus**, not improvement on live
corrections. The mechanism sharpens automatically as review volume grows; live measurement becomes
meaningful only as the review tables fill. **(CF-25.4)**

## Held-out measurement is synthetic-only
The baseline-vs-few-shot metric runs against seeded held-out inputs through a deterministic mock model
designed to discriminate on few-shot presence. It validates the *measurement apparatus*, not a live
result. There is no live held-out eval until there is live data to split. **(CF-25.4)**

## No human-curation "approved-for-few-shot" flag
Every harvested gold/positive pair for a tenant is eligible for injection (GOLD-first, cap 20). There
is no operator step to curate, bless, or exclude specific corrections. With single-digit pairs there
is no curation problem to solve yet; the flag (and the schema it would need) is deferred until
selection heuristics are real / data is non-trivial. **(CF-25.2)**

## Negatives harvested but not injected
Rejected drafts are classified and returned by the reader but are **excluded from the injectable
set** — a reject is not a "good output" example. They are banked for a future contrastive-eval rung
(show the model what *not* to produce). **(CF-25.3)**

## Few-shot provenance not recorded on `agent_runs`
`agent_runs.prompt_version` says which template ran but not **which correction examples** were
injected into that run. Provenance is therefore incomplete about what the model actually saw.
Recording the injected set (or a hash/count) is deferred — an observability concern, no schema added
(`0047` left free for the deciding phase). **(CF-25.1)**

## Feedback-poison concern (untrusted corrections) — deferred
There is no trust/quality filter on which operator corrections become examples; the operator pool is
trusted for now (implicit signal quality). Adversarial or low-quality corrections poisoning the
few-shot set is a real concern that **revisits when the operator pool grows**. **(roadmap §25 note;
tracked under CF-25.4)**

## Scope of agents
Only `update_rewriter_v1` and `scope_generator_v1` participate (they have draft/review tables).
`dispatch_router_v1` is rule-based (no draft to correct); chatbot tools are unbuilt. New Phase-26
agents become new correction sources as they land.
