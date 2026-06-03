# Phase 25 — Business Rules

The rules the feedback loop enforces, validated against live code + the 13/0 harness.

## Classification
- **Three buckets, derived from the existing review row.** POSITIVE = `decision='approve'` AND edit
  IS NULL. GOLD = `decision='approve'` AND edit IS NOT NULL. NEGATIVE = `decision='reject'`. The
  review `decision` enum is binary; there is no fourth state.
- **Latest review per draft wins.** A draft may have multiple review rows; only the newest (by
  `created_at`) is classified. This ordering is **shared with the Phase-24 observability reader** and
  must not diverge.
- **GOLD is the human correction.** For a gold pair, the diff between `draftContent` and
  `editedContent` is the operator's fix — the highest-value signal. POSITIVE is a confirmed-good
  draft (no fix needed).

## Selection for injection
- **GOLD outranks POSITIVE.** `selectFewShotPairs` orders gold pairs first, then positive.
- **Cap = 20 pairs per agent.** ~10–20 examples is the band that meaningfully sharpens without
  bloating the prompt; the cap is a parameter (default 20).
- **NEGATIVE is never injected.** Rejects are excluded from the injectable set in MVP — a reject is
  not a "good output" example. They are still **harvested and returned** by the reader (banked for a
  future contrastive-eval rung).
- **Tenant-scoped + per-agent.** Pairs come only from the same tenant and the same agent's review
  table. No cross-tenant, no cross-agent leakage.

## Injection
- **Few-shot sharpens the DRAFT only — the §2.5-v1 gate is untouched.** Every agent output still lands
  at `disposition='queued_for_review'`; nothing auto-publishes. AI output remains a reviewable draft,
  never final.
- **Empty set → unchanged single-shot prompt.** With no pairs, the agent behaves byte-for-byte as it
  did before Phase 25 (the invariant-preserving default). Fresh tenants are unaffected until they
  accumulate corrections.
- **Mock path skips harvesting.** Deterministic stub runs do not read corrections or inject few-shot.
- **Failover untouched.** Few-shot rides inside the existing `runWithFailover` wrap; `recordedModel`
  still reflects the provider that actually ran.

## Honesty boundary
- **No live quality lift is claimed.** The phase ships the machinery and proves it is **measurable**
  on a seeded corpus (plumbing + a discriminating metric over held-out inputs). It does **not** assert
  that real operator corrections have improved live agent output — live data is too thin (1 gold pair
  platform-wide). Measurable live improvement is a function of accumulating review volume.
- **Trusted-operator review = implicit signal quality.** There is no curation/trust filter on which
  corrections are injectable; the operator pool is trusted for now. The "feedback poison" concern
  (untrusted corrections) is revisited when the operator pool grows.
