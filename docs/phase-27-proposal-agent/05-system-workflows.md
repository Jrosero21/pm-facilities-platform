# Phase 27 — System Workflows

The five flows of `proposal_generator_v1`, end to end.

## 1. Generation (number-free draft, always queues)

```
runProposalGenerator(tenantId, jobId, triggeredByUserId)
  │
  ├─ openRun(agent_id=proposal_generator_v1, trigger=operator_manual)
  ├─ read job context (getJobDetail, getJobStatusCode)        ← auto-logged tool calls
  │     └─ ELIGIBILITY GATE: statusCode ∉ {NEW, CANCELLED, CLOSED, CLOSED_BILLED}
  │            └─ else throw JOB_NOT_BILLABLE   (permissive — progress billing allowed)
  ├─ resolve routing (mock?) → resolve prompt (fail-closed) + resolveAgentPolicy
  │     └─ no policy seeded → { requiresReview: true }  (fail-safe)
  ├─ few-shot ← selectFewShotPairs(proposalCorrectionPairs(tenant))   (skipped on mock)
  ├─ generateProposal()  ──►  NUMBER-FREE object: { lineItems:[{category,description,scopePhrasing}], … }
  │            (no quantity/unitPrice/markup/tax field exists in the schema)
  ├─ logDecision(type=proposal_generation, disposition=queued_for_review)
  ├─ write proposal_drafts @ pending_review   (proposed_proposal immutable)   ← auto-logged
  └─ closeRun(succeeded)        ── ALWAYS queues; no auto-execute ──
```

## 2. Review + pricing (where dollars first appear)

```
operator opens the pending draft
  │
  ├─ AI phrasing (category + description + scopePhrasing)  ── the starting point
  ├─ operator AUTHORS pricing per line (quantity, unit price)   ← edited_content
  │
  ├─ (optional) previewProposalRoutingAction(serializedLines)   ── read-only, no write
  │     └─ resolveEditedProposal → resolveClientMarkupDefault → computeArLines(total)
  │        → getEffectiveNte → decideProposalKind(total, nte, false)
  │        → { total, effectiveNte, willRoute: internal|client, willRouteIfForced: client }
  │            (SAME decideProposalKind as publish ⇒ preview ≡ publish)
  │
  └─ createProposalReview(decision=approve, edited_content)   ── 2-row txn, audit inside
        │   (reject needs a reason; discard dismisses)
        └─ draft → approved        proposed_proposal stays IMMUTABLE
```

## 3. Publish + the NTE send-gate (the load-bearing sequence)

```
publishProposalDraft(tenantId, jobId, draftId, actorUserId, forceClientReview?)
  a. getProposalDraft           (wrong tenant/job → DRAFT_NOT_FOUND)
  b. publishedProposalId != null → ProposalAlreadyMaterialized      (pre-flight idempotency)
  c. status != 'approved'        → DraftNotApproved
  d. content = approveReview.editedContent ?? draft.proposedProposal   (edited wins, D4)
  e. job → clientId ;  effectiveNte = getEffectiveNte()   (string | null)
  f. markupResolved = resolveClientMarkupDefault()         (resolved ONCE — D2/divergence-1)
  g. PRICING GUARD + total:
        for each line: quantity & unitPrice well-formed decimal? else → ProposalRequiresPricing  ← FAILS CLOSED
        total = computeArLines(lines + markupResolved).total            (Big.js, shared primitive)
        ── NTE GATE ──
        kind = decideProposalKind(total, effectiveNte, forceClientReview === true)
             forceClientReview → client   (toward-review only, §2.1-safe)
             effectiveNte null → client   (fail-safe)
             total ≤ NTE       → internal
             else              → client
  h. createProposal({ kind, scopeSnapshot })                 (own txn; lands status='draft')
  i. per line: addProposalLineItem({ markupPercent: markupResolved })   (recalc inside each)
  j. FINALIZE txn (SELECT … FOR UPDATE the draft; re-check approved & null):
        if kind=='internal':  proposals.status → 'internal_billed'
                              emit job_billing_event 'proposal.internal_billed'   (§2.2)
        update draft: status='published', published_proposal_id=<id>  WHERE published_proposal_id IS NULL
        affectedRows != 1 → ProposalAlreadyMaterialized
        audit_logs(proposal_draft.published)   ── inside the txn
```

> **Non-atomic window (documented — CF-27.3).** Steps h–i (own-txn billing writers) run *before* the
> finalize txn (j) stamps `published_proposal_id`. A mid-sequence crash leaves the draft's
> `published_proposal_id` NULL, so a retry re-materializes and orphans the first `proposals` row (a
> never-finalized draft proposal, operator-deletable). The finalize txn's lock + re-check is the single
> authority for "published exactly once." §2.6 accepted trade-off, analogue of CF-26.2.

## 4. Client-visibility seal (the load-bearing predicate)

```
listClientJobProposals(tenant, job, clientScope)            ── the ONLY path a proposal reaches a client
  WHERE status = 'sent'  AND  kind = 'client'                ← BOTH predicates, ANDed
        (scope-guarded via getClientJobDetail)
  ⇒ an INTERNAL proposal can NEVER appear on a client surface, even at status='sent'.
```

Operator surfaces (`listProposalsForJob`, the close-readiness `open_proposals` count) gate by `kind`
where appropriate; the operator list shows **both** kinds with a Client/Internal badge (D1 —
operators should see internal proposals).

## 5. Feedback harvest (number-free by construction)

```
proposalCorrectionPairs(tenant)
  agent_runs(proposal_generator_v1) → proposal_drafts → proposal_reviews   (join on proposalDraftId)
  draftContent  = phrasingOnly(CAST proposed_proposal AS CHAR)              ← numbers stripped
  editedContent = phrasingOnly(CAST edited_content AS CHAR)                 ← numbers stripped
  latestReviewPerDraft (createdAt canonical — the ONE shared primitive)
  classify:
     decision=reject                                  → negative
     d = normalizedLevenshtein(draftPhrasing, editPhrasing):
        d ≤ 0.15  → positive  (assistant turn = draftContent)
        d ≥ 0.5   → negative  (excluded from few-shot)
        else      → gold      (assistant turn = editedContent — the teaching example)
  ⇒ selectFewShotPairs (gold-first, cap 20, negatives excluded)
     buildFewShotMessages (UNCHANGED — reads only the phrasing strings ⇒ number-free few-shot)
```
