# AI-Assisted Dispatch — System Workflows

## Auto-dispatch pick flow (autoDispatchDraftForJob)
1. Idempotency short-circuit (already-active assignment ⇒ return).
2. Matcher returns the eligible candidate set (`findCandidateVendorsForJob`):
   trade + geo + compliance + not-blocklisted; preferred-then-rank ordered.
   Empty ⇒ `no_candidates`.
3. Score: `toScoredCandidate` joins each candidate's completion rate for the
   job's primary trade (batch read `getVendorPerformanceScoresForVendors`),
   applies the volume shrink; `rankCandidates` orders by preference → track
   record → matcher order. `isCloseCall` flags the top-two epsilon tie.
4. Hoisted resolve (single source of truth): clientId (from the already-fetched
   job), `resolveAgentPolicy`, `withinTokenCeilings`.
5. Tiebreaker (only if closeCall AND `shouldFireTiebreaker(mode, autonomy,
   tokenOk)`): open `dispatch_tiebreaker_v1` run → resolve routing → (non-mock)
   resolve prompt → `generateDispatchTiebreak` over the two close candidates →
   `applyTiebreak` (validate to pair; low-confidence ⇒ leader stands) → reorder
   ranked if changed → logDecision + closeRun (model, tokens). Any error ⇒
   closeRun failed, deterministic ranking stands, dispatch continues.
6. `top = ranked[0]` → `createDispatch(top)` (re-validates candidacy server-side;
   `VENDOR_NO_LONGER_CANDIDATE` ⇒ no_candidates).
7. writeAuditLog (auto_drafted): full ranking + tiebreak source/changed/rationale.
8. Router run (`dispatch_router_v1`, reusing hoisted resolved/token): the gate —
   `permitted = autonomyEnabled && token.ok && spend.ok`. Permitted ⇒ sendDispatch
   (DRAFT→SENT, auto_executed). Not ⇒ logDecision policy_blocked, drafted_pending.

## Degradation paths (all → deterministic ranked[0])
- Provider down ⇒ runWithFailover exhausts ⇒ tiebreaker run fails ⇒ leader stands.
- Token ceiling hit ⇒ shouldFireTiebreaker false ⇒ no call.
- Mode off / autonomy off under autonomy_only ⇒ no call.
- LLM out-of-pair or low-confidence pick ⇒ applyTiebreak keeps leader.

## Provenance
- Re-rank: full ranking in the auto_drafted audit metadata + governance
  decisionMeta (router run).
- Tiebreak: its own `dispatch_tiebreaker_v1` agent_run (model, tokens, rationale,
  changedByLlm) + tiebreak fields in the auto_drafted audit metadata.
