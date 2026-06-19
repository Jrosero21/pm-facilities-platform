# AI-Assisted Dispatch — Decisions

## D1. Additive, not greenfield
`dispatch_router_v1` already existed end-to-end (registered, governed,
seeded). The placeholder pick was literally `candidates[0]`. This work REPLACED
that one line with a scored re-rank and LAYERED an LLM tiebreaker before the
existing autonomy gate — it did not build a new dispatch agent or a new
disposition path. The gate, ceilings, and provenance plumbing were reused.

## D2. Vendor pick priority (operator-confirmed)
Ranked by Jonny: (1) preferred vendor for the location, (2) best track record,
(3) does this exact trade as their main line. Implemented as a strict priority
ladder (stable lexicographic sort), NOT a blended score — so track record can
never quietly overcome a preferred-vendor arrangement.

## D3. Track record = completion rate (data-driven)
Sandbox probe: `completion_rate`/`on_time_rate`/`score` are 0..100;
`avg_rating` is 100% NULL; `on_time_rate` is too uniform in current data to
carry signal. So track record is completion rate alone (÷100). The three-way
"finish vs on-time vs rating" weighting question collapsed — only one signal
has dense data. On-time and rating are built as dormant inputs.

## D4. Volume-confidence shrink + neutral prior
A normalized rate is shrunk toward 0.5 by a pseudo-count (k=5): n=0 ⇒ exactly
the prior. Decisions locked with Jonny: an unproven (no-record) vendor sits at
the neutral middle — ahead of a proven-weak vendor, behind a proven-strong one
("give the newcomer a fair shot; the exception queue catches a no-show").

## D5. Separate agent `dispatch_tiebreaker_v1`, not a mode of the router
Policy, observability, and provenance all key on `agentId`; a distinct agent
keeps the tiebreaker's approve-rate, cost line, and runs cleanly separable from
the rule-based router (whose runs stay model-NULL). It needs no policy default
of its own to gate dispatch — it only reorders the close pair BEFORE the
existing `dispatch_router_v1` gate.

## D6. The tiebreaker can change the pick (has teeth)
Decision locked with Jonny: the LLM reorders the two close candidates before
`createDispatch` — it is a real tiebreaker, not an annotation on a draft. Bounded
to the pair; never a third vendor; never overrides preference or a non-close
track-record gap.

## D7. Per-tenant firing mode; conservative default
The "when does the tiebreaker spend an AI call" choice is per-tenant
(`tiebreakerMode` in agent policy JSON — the no-migration home, since the policy
column already passes unknown keys through to `resolved.raw`). Platform default
`autonomy_only`: fire only when the tenant has autonomy on. `always_on_close_call`
also annotates held drafts; `off` never fires.

## D8. Three paths to graceful degradation, one fallback
The deterministic `ranked[0]` stands whenever: the provider is down
(`runWithFailover` exhausts), the token ceiling is hit (pre-spend guard), the
mode/autonomy says don't fire, OR the LLM returns an out-of-pair / low-confidence
pick. The numbers always decide when the AI can't or shouldn't.

## D9. Seed-data, prod-write guard, no migration
House convention keeps agent-default data in `db/seeds/agent-config.ts`
(idempotent insert-if-absent), not numbered migrations. The seed lacked a
sandbox guard (wrote prod by default) — added an env-swap guard defaulting to
sandbox, prod via explicit `SEED_ALLOW_PROD=1`. The existing already-seeded
`dispatch_router_v1` row needed a targeted idempotent UPDATE (insert-if-absent
won't touch it) to add `tiebreakerMode`.

## D10. Naming: descriptive, never the roadmap number
Mid-build, `scripts/check-phase-27.ts` collided with the shipped proposal
harness (repo Phase 27 = proposal agent). Convention locked: this work is
"AI-assisted dispatch" in every filename/script/comment/folder; the roadmap's
"Phase 27" is a pointer, not the identifier.
