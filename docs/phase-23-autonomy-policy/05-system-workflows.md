# Phase 23 — System Workflows

The governed auto-dispatch flow, end to end. Implemented in `src/server/auto-dispatch.ts`
(`autoDispatchDraftForJob`), composing `resolveAgentPolicy` (`agents/config/policies.ts`),
`withinTokenCeilings` + `withinSpendCeilings` (`agents/config/guardrails.ts`), the runner
(`agents/runner.ts`), and `sendDispatch` (`dispatch.ts`).

## The flow

```
autoDispatchDraftForJob(tenantId, jobId)
  a. Idempotency guard — non-terminal assignment already exists? → already_active (stop)
  b. Matcher (findCandidateVendorsForJob) — empty floor? → no_candidates (stop)
  c. createDispatch(top candidate, createdByUserId: null)  → DRAFT  (ALWAYS — a draft commits nothing)
  d. writeAuditLog "job_vendor_assignment.auto_drafted"    (Phase-22 legibility record, kept)
  e. GOVERNANCE GATE:
       ctx = openRun({ agentId: "dispatch_router_v1", triggerSource: "auto_dispatch" })  ← synthetic run FIRST
       resolved = resolveAgentPolicy(tenantId, "dispatch_router_v1", job.clientId)
                    step 0: kill switch (tenant_autonomy_settings)  → if on, source "kill_switch", gated
                    step 1: per-client policy
                    step 2: per-tenant policy
                    step 3: platform default (agent_policy_defaults)
                    step 4: fail-safe (requiresReview:true, autonomyEnabled:false)
       token = withinTokenCeilings(tenantId)            ← §2.4 token breaker
       spend = withinSpendCeilings(tenantId, jobId)     ← §2.4 committed-$ breaker (+ null-NTE block)
       permitted = resolved.autonomyEnabled && token.ok && spend.ok
       ├─ NOT permitted → logDecision(policy_blocked, blockedBy) → closeRun(succeeded)
       │                  → drafted_pending   (the DRAFT stays for operator review)
       └─ permitted     → sendDispatch({ assignmentId, actorUserId: null })   ← DRAFT→SENT, NULL system actor
                          ├─ ok    → logDecision(auto_executed) → closeRun(succeeded) → auto_advanced
                          └─ threw → logDecision(queued_for_review, sendError)
                                     → closeRun(failed) → drafted_send_failed
```

The draft is created **before** the gate — the gate decides whether to **auto-advance** it, never
whether to draft. A gated draft is the operator's fallback.

## Result union (`AutoDispatchResult`)

| Outcome | Meaning |
|---|---|
| `auto_advanced` | Permitted; DRAFT advanced to SENT (`jobStatusAdvanced` true if the job moved NEW/SCHEDULED→DISPATCHED). |
| `drafted_pending` | Gated; DRAFT created, not advanced. Carries `blockedBy` (`not_enabled` / `kill_switch` / `token_ceiling` / `spend_ceiling` / `unmeasurable_nte`). |
| `drafted_send_failed` | Permitted but `sendDispatch` threw; DRAFT exists, awaits a human. Carries `error`. |
| `no_candidates` | Empty eligibility floor; nothing created. |
| `already_active` | A non-terminal assignment already exists for the job. |

**The bare `"drafted"` outcome no longer occurs** — every successful `createDispatch` now runs the
gate and returns one of the above. (Phase-22's `check-phase-22.ts` was migrated `drafted` →
`drafted_pending` accordingly; see `02-decisions.md`.)

## Auto-advance (DRAFT→SENT)

`sendDispatch({ ..., actorUserId: null })` — the NULL system actor (the 23f-1 widening
`actorUserId: string | null`). It writes the assignment status-history, two audit rows, the
`job.dispatched` job event, and (only from NEW/SCHEDULED) the job-status advance + its history row
— **all with `changed_by_user_id` / `actor_user_id` = NULL** (verified-nullable sinks, no migration
needed). The job advances to DISPATCHED only from NEW/SCHEDULED; IN_PROGRESS/ON_HOLD/DISPATCHED
send without a status change.

## Idempotency (two layers, §2.6 — no third added)

1. **Step-a non-terminal guard** — a second `autoDispatchDraftForJob` on a job that already has a
   non-terminal assignment returns `already_active`; no second draft.
2. **`ASSIGNMENT_NOT_DRAFT`** — `sendDispatch` re-checks DRAFT under a row lock; a double-advance of
   an already-SENT assignment **throws**, never double-sends.

## Provenance

Every governed run leaves a synthetic `agent_runs` row + one `agent_decisions` row (`auto_executed`
/ `policy_blocked` / `queued_for_review`). The Phase-22 `auto_drafted` audit log is additive and
unchanged. Token columns on the synthetic run are NULL, so it never affects the token meter.
