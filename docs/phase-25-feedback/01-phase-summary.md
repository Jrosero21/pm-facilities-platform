# Phase 25 — Phase Summary

**Feedback Loop: Harvest Corrections → Few-Shot** · v2.8.0-phase-25 · branch `phase-25-feedback`.

## Goal

Turn the operator corrections the platform **already records** into agent accuracy — the cheapest
rung on the improvement ladder. The two LLM agents (`update_rewriter_v1`, `scope_generator_v1`)
already land every draft at the §2.5-v1 review gate, and operators already approve, edit, or reject
them. That review activity **is** a labeled training signal; Phase 25 harvests it and feeds the best
examples back into the agents' prompts as few-shot demonstrations.

## The arc: harvest → select → inject → prove

1. **Harvest (25b).** A compute-on-read reader (`correction-pairs.ts`) joins the existing
   `run → drafts → reviews` chain, dedupes to the latest review per draft, and classifies each
   corrected item into three buckets: **POSITIVE** (approve, no edit), **GOLD** (edit-then-approve —
   the draft↔edited diff is the human correction), **NEGATIVE** (reject). It returns the raw content
   pair (draft + edited) per item.
2. **Select.** `selectFewShotPairs` picks **GOLD-first, then POSITIVE**, capped at 20, with
   **NEGATIVE excluded** from the injectable set (rejects are banked for contrastive eval, not shown
   as "good" examples).
3. **Inject (25c).** `buildFewShotMessages` turns the selected pairs into prior conversational turns;
   both live LLM call sites (`generateRewrite`, `generateScope`) prepend them via a **messages array**
   before the real user prompt. With no pairs, the call falls back **byte-for-byte** to today's
   single-shot prompt.
4. **Prove (25d).** A phase-blocking harness (`db:check:feedback`, 13/0) demonstrates the few-shot
   path is measurable against held-out examples — on a **seeded synthetic corpus**.

## The data-thinness reality (stated up front)

Live correction data is **extremely thin**: across the whole platform there is currently **1 gold
pair** (scope) plus a handful of positives, **zero rejects**. That is exactly why few-shot is the
right rung — you start few-shot *because* data is scarce. The honest consequence: this phase ships
**machinery proven on a seeded corpus**, not a measured quality lift on live data. The mechanism
sharpens automatically as operators accumulate reviews; the better operators correct drafts, the
sharper the agents get — with nothing new to configure.

## What did not change

No schema, no migration — **0047 stays free**. The §2.5-v1 draft-review gate is untouched: few-shot
sharpens the *draft*; AI output remains a reviewable draft, never final. Failover / `recordedModel`
semantics from Phase 24 are untouched. `dispatch_router_v1` (rule-based, no review table) and the
unbuilt chatbot tools are out of scope.
