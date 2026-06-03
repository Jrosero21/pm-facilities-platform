# Phase 25 Closeout — Feedback Loop (Harvest Corrections → Few-Shot)

## Phase Goal
Turn the operator corrections the platform already records into agent accuracy — the cheapest
improvement rung. Harvest the labeled signal in the draft/review tables, mine the best correction
pairs into the two LLM agents' prompts as few-shot, and prove the few-shot path is measurable against
held-out examples. v2.8.0-phase-25.

## Completed Deliverables
- **Harvesting reader (25b)** — `correction-pairs.ts`: joins `run → drafts → reviews`, dedupes to the
  latest review per draft (shared `createdAt` ordering), classifies into POSITIVE / GOLD / NEGATIVE,
  and returns the raw draft↔edited content pair. Scope JSON returned as the verbatim string.
- **Shared dedupe primitive extracted** — `latestReviewPerDraft` lifted out of
  `agent-observability.ts` (which now imports it); behavior-preserving (Phase-24 harness still 28/0).
- **Selector + message builder** — `selectFewShotPairs` (GOLD-first, cap 20, NEGATIVE excluded);
  `buildFewShotMessages` (pairs → prior user/assistant turns; raw approved content verbatim).
- **Few-shot injection seam (25c)** — both live LLM paths (`generateRewrite`, `generateScope`) inject
  selected pairs as a messages array before the real user prompt; empty set falls back byte-for-byte
  to the single-shot prompt. `fewShot` threaded like `failoverOrder`; runners harvest tenant-scoped,
  skipping the mock path.
- **Phase-blocking acceptance harness (25d)** — `scripts/check-phase-25.ts` (`db:check:feedback`):
  seeded corpus → real-reader harvest → baseline-vs-few-shot over held-out inputs via a
  prompt-capturing mock model → deterministic discriminating metric, with an explicit honesty log.

## Files Created or Changed
- **New:** `src/server/analytics/correction-pairs.ts`; `scripts/check-phase-25.ts`.
- **Changed:** `src/server/analytics/agent-observability.ts` (import shared primitive);
  `src/server/agents/update-rewriter/{llm,index}.ts`;
  `src/server/agents/scope-generator/{llm,index}.ts`; `package.json` (`db:check:feedback` script).
- **Docs:** `docs/phase-25-feedback/01..11` + `closeout-carryforwards.md`.

## Database Changes
**NONE.** No schema, no migration; `0047` stays free. Compute-on-read over the existing draft/review
tables. Deferred: few-shot provenance on `agent_runs` (CF-25.1, banked, not built).

## API Routes / Server Actions Added
**NONE.** All changes are internal to the agent pipeline; no new route, endpoint, or action.

## User-Facing Workflows Added
**NONE new to click.** Operator approve / edit-then-approve / reject now double as the training signal
(positive / gold / negative). AI output remains a reviewable draft, pending review.

## Admin/Internal Workflows Added
The loop is on by default, tenant-scoped and per-agent, inside the existing pipeline. Fresh tenants
behave exactly as before until corrections accumulate; the mock path skips harvesting.

## Business Rules Added
Three-bucket classification; latest-review-per-draft (createdAt); GOLD-first selection, cap 20,
NEGATIVE excluded from injection; messages-array injection with system prompt unchanged; empty-set
single-shot fallback; §2.5-v1 gate untouched; no live quality lift claimed.

## Chatbot Knowledge Added
What the feedback loop is, how corrections sharpen the agents, why it is quiet today (thin data), that
the review gate is unchanged, and the honesty boundary (seeded proof, not live measurement).

## Verification Performed

Commands/results:

```bash
pnpm tsc --noEmit                 # exit 0 (0 errors)
pnpm db:check:feedback            # PHASE-25 FEEDBACK LEDGER GREEN ✓ — passed: 13, failed: 0
                                  #   re-run idempotent (13/0); 0 orphaned phase25-harness-tenant rows
pnpm db:check:observability       # PHASE-24 OBSERVABILITY LEDGER GREEN ✓ — passed: 28, failed: 0
                                  #   (proves the shared-primitive extraction is behavior-preserving)
```

Live spot-check (25b): rewriter 1 positive / 0 gold / 0 negative; scope 2 positive / **1 gold** / 0
negative — the single live gold pair surfaced with both content blobs (real human correction).

## Known Limitations
Thin live data (machinery proven on seeded corpus only); held-out measurement synthetic-only; no
human-curation flag (deferred); negatives harvested-but-not-injected (banked); few-shot provenance not
on `agent_runs` (banked); feedback-poison concern deferred until the operator pool grows. See
`10-known-limitations.md`.

## Carry-Forward Items
New: **CF-25.1** (few-shot provenance on `agent_runs`), **CF-25.2** (human-curation flag),
**CF-25.3** (negatives → contrastive eval), **CF-25.4** (seeded-only held-out measurement +
feedback-poison). RETIREMENTS: **NONE** by Phase 25 (net-new machinery; delivers no banked item).
CF-24.2 (live autonomy trigger) rolls forward OPEN. Full bank in `closeout-carryforwards.md`.

## Recommended Next Phase Focus
**Phase 26 — New Agents, invoice creator first.** Low-stakes / high-volume (routine, lots of reps →
fast, safe correction signal that immediately feeds this Phase-25 loop). Follows the proven pattern:
register → shared runner → draft → §2.5-v1 gate → policy-able (Phase 23) → feedback-fed (Phase 25);
retires B-16.5 per agent. Then proposal generator, then NTE negotiator (highest-stakes, gated longest).
