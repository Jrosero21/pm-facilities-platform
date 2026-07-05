# Phase 28 — System Workflows

## Autonomous re-dispatch (the auto-response escalation)
Trigger (today: operator button T2a/T2b; future: scheduled — deferred) →
```
stuck SENT assignment
  → STUCK-STILL-SENT pre-check (idempotency; ghosted/responded/terminal → clean no-op)
  → open an agent run (triggerSource: auto_redispatch, system actor)
  → PREPARE the rung-1 suggestion (prepareRedispatchSuggestion; already_suggested → no-op)
  → FINE GATE (see below)
     ├─ permitted   → APPROVE: ghost the stuck vendor, send the replacement DRAFT → vendor B SENT
     │                disposition: auto_executed
     └─ not permitted → leave the rung-1 DRAFT pending for operator review
                        disposition: policy_blocked, blockedBy: <first failing gate>
  → close the run
```

## The gate composition (identical at both autonomous sites)
`auto-dispatch.ts` (rule-based auto-dispatch of a NEW job) and `auto-redispatch.ts` (escalation) compose the **same** permission:
```
permitted =
     resolved.autonomyEnabled     // kill-switch step-0 + policy half (fail-safe: default gated)
  && token.ok                     // §2.4 token spend-breaker
  && spend.ok                     // §2.4 committed-$ breaker (+ null-NTE block)
  && conditionsResult.pass        // Phase-28 policy-conditions (narrowing; absent = no-op)
  && quality.ok                   // §2.4 accuracy floor (N/A for the deterministic router)
  && consent.allowed              // Phase-28 client-autonomy-consent (this phase)
```
- **HOLD-only:** every conjunct can only make `permitted` false. Nothing in the chain widens permission.
- **Fail-safe:** an unresolvable/missing input on any axis resolves toward gated (§2.1). `consent` fails to `allowed:false` on a null/unresolvable client.
- **Provenance:** the not-permitted path records `blockedBy` (`kill_switch` / `not_enabled` / `token_ceiling` / `spend_ceiling` / `policy_condition:<reason>` / `quality_floor` / **`client_autonomy_not_consented`**) and `decisionMeta.clientAutonomyAllowed` on the agent decision.

## Consent resolution
`clientAutonomyConsent(tenantId, clientId)` → reads the job's client row:
- `clientId === null` → `{ allowed: false, mustNotify: false }` (fail-safe)
- client not found / cross-tenant → `{ allowed: false, ... }` (fail-safe)
- else → `{ allowed: autonomy_allowed, mustNotify: must_notify_client }`

`mustNotify` is surfaced but not acted on (send deferred).

## Idempotency across autonomous paths
- Auto-dispatch: per-job non-terminal guard (no second draft) + `sendDispatch`'s `ASSIGNMENT_NOT_DRAFT` floor.
- Auto-redispatch: stuck-still-SENT pre-check + rung-1 `already_suggested`.
- Send: Resend `Idempotency-Key = commId`.
A misfiring trigger or two close-together triggers cannot double-dispatch, double-send, or double-approve.
