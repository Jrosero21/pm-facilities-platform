# AI-Assisted Dispatch — Phase Summary

## What this is
The Tier-3 "smart picker" for vendor dispatch. When several eligible vendors can
take a job, the system ranks them deterministically and — only when the top two
are genuinely too close to separate — asks an LLM to break the tie by semantic
fit. The LLM is never the primary chooser and never sees an ineligible vendor.

## The arc, in one line
Eligible set (existing matcher) → deterministic scorer (new) → LLM tiebreaker on
close calls only (new) → existing autonomy gate (unchanged) → draft or send.

## What shipped
- `src/server/scorer.ts` — deterministic ranking: preferred-for-location →
  track record (volume-shrunk completion rate) → trade-fit/geo/name.
- `src/server/auto-dispatch.ts` — re-rank replaces the `candidates[0]`
  placeholder; full ranking recorded to audit + decision metadata.
- `dispatch_tiebreaker_v1` — separate LLM agent; number-free; fires only on a
  close call; bounded to the two close candidates; own provenance run.
- Per-tenant firing mode (`tiebreakerMode`: autonomy_only / always_on_close_call
  / off; default autonomy_only) in agent policy JSON — no migration.
- Prod-write guard on the agent-config seed (sandbox default; prod via
  `SEED_ALLOW_PROD=1`).
- `scripts/check-ai-dispatch.ts` acceptance harness.

## State at close
Offline harnesses green (scorer 17, llm 6, decide 13); sandbox harness 33/33;
seed idempotent. Platform defaults seeded in SANDBOX only. No migration (latest
remains 0054). Committed + pushed across 4 commits (e5b08e0, 2e389af, 1ac50e5,
f0475af). Closes at v2.24.0 (tag applied after the docs commit — see closeout).

## Naming
"AI-assisted dispatch" is the descriptive name. Repo "Phase 27" = the shipped
proposal agent, a different feature; the roadmap number is a pointer only.
