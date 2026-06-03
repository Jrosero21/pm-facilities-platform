# Phase 25 — Decisions

Locked decisions with rationale. Validated against live code + the 13/0 feedback harness (and the
still-green 28/0 Phase-24 harness, which gates the shared-primitive extraction).

## Scope & schema
- **Compute-on-read, NO new table/column — all of Phase 25.** Everything harvesting needs already
  exists in the draft/review tables (draft content, edited content, decision, the FK chain,
  timestamps). With single-digit live pairs, a cached "correction-pairs store" or a curated-flag
  column would be premature. The phase is read + code only. **0047 untouched.**
- **Two LLM agents in scope only.** `update_rewriter_v1` (text: `draft_content`/`edited_content`)
  and `scope_generator_v1` (JSON: `proposed_steps`/`edited_steps`). `dispatch_router_v1` is
  rule-based with no review table — out of scope. Chatbot tools are unbuilt.

## Harvesting (25b)
- **`createdAt` is the canonical latest-review-per-draft ordering.** A draft can carry multiple
  review rows (re-reviews; `draft_id` is non-unique). The dedupe keeps the newest review by
  `createdAt` — **the exact ordering the Phase-24 reader uses**. The two readers MUST NOT diverge
  here, or the bucket counts would disagree with the observability approve-as-is numbers.
- **Shared dedupe primitive, extracted (not reinvented).** The latest-review-per-draft logic that
  was inlined in `agent-observability.ts` (`classifyLatestReviews`) is extracted into
  `correction-pairs.ts::latestReviewPerDraft`; observability now imports it. The refactor is
  **behavior-preserving** — verified by the Phase-24 harness staying **28/0**. The new module owns
  the primitive (the phase-neutral pure util); observability depends on it. (Retention-extraction
  precedent: one shared implementation, multiple consumers.)
- **Three buckets.** POSITIVE = `approve` + edit IS NULL; GOLD = `approve` + edit IS NOT NULL;
  NEGATIVE = `reject`. The review `decision` enum is binary (`approve`/`reject`) — no third value.
- **JSON returned as the raw stored string.** Scope's `proposed_steps`/`edited_steps` are read via
  `CAST(... AS CHAR)` to bypass drizzle's `json()` decoder — the reader hands back the verbatim JSON
  string; parsing/shaping is the injection layer's concern, not the reader's.

## Selection
- **GOLD-first, then POSITIVE; cap 20.** Gold (real human corrections) outranks positive (confirmed
  good drafts). ~10–20 pairs/agent is the band that meaningfully sharpens.
- **NEGATIVE excluded from the injectable set.** A reject is not a "here is a good output" example.
  Rejects are still **returned by the reader** (observability / future contrastive eval) — just not
  selected for injection in MVP.

## Injection (25c)
- **Messages-array injection, NOT system-append.** Selected pairs become prior user/assistant turns
  via `buildFewShotMessages`, prepended before the real user prompt. The **system prompt is
  unchanged**. This is the standard few-shot shape and keeps the DB-resolved system prompt intact.
- **Empty-set → single-shot fallback (the invariant-preserving default).** No pairs → empty messages
  → the call runs `prompt: buildUserPrompt(...)` exactly as before this phase. An agent (or fresh
  tenant) with zero corrections behaves **byte-for-byte** as it did pre-25. Proven in 25c and
  re-asserted by the harness baseline arm.
- **`fewShot` threaded like `failoverOrder`.** The optional input rides the existing thread into
  `generateRewrite`/`generateScope` and passes through `runWithFailover` unchanged — failover and
  `recordedModel` semantics untouched.
- **Assistant turn carries the raw approved content verbatim.** Gold → `editedContent`; positive →
  `draftContent`. For scope this is the JSON string presented directly as the structured answer — no
  re-stringify (no double-encoding).

## Acceptance proof (25d)
- **Seeded-corpus harness proves PLUMBING + MEASURABILITY, NOT a live lift (the honesty rule).** Live
  data (1 gold pair) is too thin for any quality claim. The harness seeds a synthetic corpus, harvests
  it with the real reader, runs each agent baseline-vs-few-shot over held-out inputs through a
  deterministic mock model that captures the prompt, and computes a marker-presence metric per arm.
  It asserts the apparatus **discriminates** (few-shot > baseline) — it does **not** assert a
  fixed-magnitude improvement as if it were live. The harness `log()`s this boundary explicitly.
- **`§2.5-v1` gate untouched.** Few-shot changes only the draft content; the queued-for-review
  disposition and all approve/publish paths are unmodified.
