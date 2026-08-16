# Phase 29 — System Workflows

## The sweep flow

```
CALLER (curl / operator button / future scheduler)
  │
  ├─ [route only] TOKEN GUARD — Bearer CRON_SECRET, SHA-256 + timingSafeEqual
  │     unset secret → 401, disabled.  wrong token → 401, no work.
  │
  ├─ [route only] TENANT ENUMERATION — tenants with an ACTIVE dispatch_router_v1 policy
  │     scan-scope only; never grants permission
  │
  └─ FOR EACH TENANT (SEQUENTIAL) → runAutoRedispatchSweep({ tenantId, now })
        │
        ├─ CANDIDATE SELECTION
        │    getExceptions(tenantId)
        │      └─ filter: kind === "vendor_not_accepted" && redispatchState === "can_suggest"
        │         ↑ THE STUCK-FILTER. Lives here, not in T1. T1 has no staleness check.
        │
        ├─ COOLDOWN LOOKUP (one grouped query for all candidate jobs)
        │    MAX(created_at) WHERE replaces_assignment_id IS NOT NULL, grouped by job
        │
        └─ FOR EACH CANDIDATE (SEQUENTIAL — never Promise.all)
              │
              ├─ cooldown? now - lastAuto < 4h → skip, byReason.cooldown++, continue
              │
              └─ autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId })   ← T1
                    ├─ kill switch → policy autonomyEnabled → token/spend ceilings
                    ├─ policy conditions → quality bar → per-client autonomy_allowed
                    ├─ PREPARE (rung-1, system actor) → prepareRedispatchSuggestion
                    │     └─ decideRedispatchCore: attemptsSoFar >= 3 → exhausted
                    │                              no untried eligible vendor → exhausted
                    └─ result:
                         auto_sent        → autoSent++     (money committed, vendor contacted)
                         prepared_blocked → heldForReview++ , byReason[blockedBy]++
                         skipped          → skipped++      , byReason[reason]++
              │
              └─ throw → caught, byReason.error++, sweep CONTINUES
        │
        └─ tenant throw → caught, byReason.tenant_error++, next tenant CONTINUES

RETURN { ok, startedAt, durationMs, tenantsScanned, totals, perTenant }
```

## Gate composition — every layer can only HOLD
The trigger adds **no** permission. It selects *what to look at*; T1 re-resolves *everything* per job:
kill switch → policy → ceilings → conditions → quality → client consent. A tenant reaching the sweep
with autonomy off produces `swept: 0` writes. This is why the entrypoint is safe to fire at any time.

## Fail-safe behaviour
| Condition | Outcome |
|---|---|
| `CRON_SECRET` unset | endpoint disabled (fails **closed**) |
| Autonomy off (default) | scans nothing, writes nothing, `tenantsScanned: 0` |
| NTE unmeasurable | spend check fails **closed** — never commits unbounded money |
| Gate blocks a job | draft **prepared and held** for operator review, not discarded |
| One job throws | tallied as `error`; sweep continues |
| One tenant throws | tallied as `tenant_error`, logged; next tenant continues |

## Two callers, one core
`autoRedispatchSweepAction` (the `/notifications` button) is now a thin wrapper: `requireTenant()` →
`runAutoRedispatchSweep` → `revalidatePath`. The route does token guard → tenant enumeration → the
same core. **Neither owns the stuck-filter or the cooldown** — the core does, so no caller can bypass
either.

## Idempotency / re-entry
Re-firing the sweep immediately is a no-op on any job touched within the cooldown window. Across
windows the count cap bounds the job to 3 total attempts, after which `redispatchState` becomes
`exhausted_max_attempts` and it is no longer even a candidate.
