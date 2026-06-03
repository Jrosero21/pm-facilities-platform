# Phase 25 — System Workflows

Three flows: the harvest read, the few-shot injection at each LLM seam, and the seeded-corpus
acceptance harness. All live in `src/server/analytics/correction-pairs.ts` + the two agent dirs.

## 1. Harvest: run → drafts → reviews → buckets + content pair

```
correction-pairs.ts
  rewriterCorrectionPairs(tenantId) / scopeCorrectionPairs(tenantId):
    SELECT  from <agent>_drafts d
      INNER JOIN agent_runs ar  ON ar.id = d.agent_run_id AND ar.agent_id = <AGENT_ID>
      INNER JOIN <agent>_reviews r ON r.draft_id = d.id
      WHERE d.tenant_id = :tenantId
      ORDER BY r.created_at DESC
      cols: draftId, agentRunId,
            draftContent   = d.draft_content            (rewriter: text)
                           | CAST(d.proposed_steps AS CHAR)   (scope: raw JSON string)
            editedContent  = r.edited_content           (rewriter: text|null)
                           | CAST(r.edited_steps AS CHAR)     (scope: raw JSON string|null)
            decision, reviewedAt, createdAt
    → latestReviewPerDraft(rows)        // shared primitive: newest-by-createdAt, first-seen-per-draft
    → classify each into a CorrectionPair:
        decision='reject'                       → bucket 'negative'   (editedContent forced null)
        decision='approve' AND edit IS NULL     → bucket 'positive'
        decision='approve' AND edit IS NOT NULL → bucket 'gold'       (editedContent = the human fix)
```

`latestReviewPerDraft<T>` is the ONE shared dedupe (extracted from `agent-observability.ts`, which
now imports it). Ordering is `createdAt` — identical to the observability reader so the numbers can
never drift. `correctionPairsForAgent` / `allCorrectionPairs` are thin wrappers over the two readers.

## 2. Select + build messages

```
selectFewShotPairs(pairs, cap = 20):
    gold     = pairs.filter(bucket==='gold')
    positive = pairs.filter(bucket==='positive')
    return [...gold, ...positive].slice(0, cap)        // GOLD-first; NEGATIVE never selected

buildFewShotMessages(pairs) -> ModelMessage[]:
    for each pair (2 turns):
      { role:'user',      content: draftContent }                 // the reviewed draft (input side)
      { role:'assistant', content: gold ? editedContent : draftContent }  // the APPROVED output, verbatim
    empty pairs → []                                   // drives the §3 single-shot fallback
```

The assistant turn is the raw stored string — for scope the JSON string is presented directly as the
structured answer (no re-stringify → no double-encoding).

## 3. Injection at each LLM seam (the live path)

```
agent index.ts (runRewriter / runScopeGenerator)
  ... resolve routing, DB prompt, policy, failoverOrder ...
  fewShot = routing.mode === 'mock'
            ? []                                               // mock skips harvest (no DB read)
            : selectFewShotPairs(await <agent>CorrectionPairs(tenantId))
  generateRewrite/Scope({ routing, systemPrompt, temperature, ..., failoverOrder, fewShot })

generateRewrite / generateScope (llm.ts)
  if routing.mode === 'mock' → deterministic stub (return)
  fewShotTurns = buildFewShotMessages(fewShot ?? [])
  userPrompt   = buildUserPrompt(...) / buildScopeUserPrompt(job)
  runWithFailover(candidates, candidate =>
    fewShotTurns.length > 0
      ? generateObject({ model, schema, system: systemPrompt,
                         messages: [...fewShotTurns, { role:'user', content: userPrompt }], temperature })
      : generateObject({ model, schema, system: systemPrompt,
                         prompt: userPrompt, temperature })       // ← unchanged single-shot fallback
  )
```

System prompt, schema, temperature, `buildCandidates`/`runWithFailover`, and `recordedModel` are all
unchanged. The few-shot turns ride **inside** the same failover wrap. The empty-set branch is the
exact pre-Phase-25 call.

## 4. Acceptance harness (scripts/check-phase-25.ts → `db:check:feedback`)

```
sandbox-guarded; fresh tenant 'phase25-harness-tenant'; teardown by tracked id under FK_CHECKS=0
  SEED corpus (per agent): 2 gold (edit inserts a known marker) + 2 positive + 1 negative,
       via the real FK chain agent_runs → <agent>_drafts → <agent>_reviews
  [H] harvest with the real reader → assert 2/2/1 buckets; selector → 4 selected, gold-first, no negative
  inject a MockLanguageModelV3 via PROVIDER_REGISTRY.anthropic.buildModel (restored in finally);
       the mock CAPTURES options.prompt and emits the marker iff the few-shot examples carry it
  [P] run each agent baseline (fewShot:[]) vs few-shot over 3 held-out inputs:
       baseline capture → single user turn, no example turns
       few-shot capture → 4 example turns BEFORE the held-out user turn, carrying the marker
  [M] metric = marker-present rate over held-out, per arm (baseline 0.00 / few-shot 1.00);
       assert the apparatus DISCRIMINATES (few-shot > baseline), NOT a fixed magnitude
  [HONESTY] log: seeded-corpus measurability + plumbing proof, NOT a live quality-lift claim
```
