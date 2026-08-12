# Phase 29 — How to run the auto-redispatch sweep

The autonomous re-dispatch sweep is **manually invoked**. There is deliberately **no cron schedule**:
with no live clients, an unattended timer would fire against test data and prove nothing. The
mechanism is built and sandbox-proven; only the automated *schedule* is deferred.

> This is not the full phase doc set. The eleven closeout docs are still owed when Phase 29 closes.

## The entrypoint

| | |
|---|---|
| Route | `/api/cron/auto-redispatch` |
| File | `src/app/api/cron/auto-redispatch/route.ts` |
| Methods | `GET` and `POST` (both run the same handler) |
| Auth | `Authorization: Bearer $CRON_SECRET` |
| Unset `CRON_SECRET` | endpoint is **disabled** — the guard fails closed, never open |

The path and header format deliberately match what Vercel Cron sends, so adding a schedule later is
a one-file change (`vercel.json` with a `crons` entry) and needs no change to the route.

## Fire it

Local dev server:

```bash
curl -s -X POST http://localhost:3000/api/cron/auto-redispatch \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

Deployed:

```bash
curl -s -X POST https://<your-deployment>/api/cron/auto-redispatch \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

Response shape:

```json
{
  "ok": true,
  "startedAt": "2026-08-11T...",
  "durationMs": 1234,
  "tenantsScanned": 1,
  "totals": { "swept": 25, "autoSent": 24, "heldForReview": 0, "skipped": 1,
              "byReason": { "no_eligible_vendor": 1 } },
  "perTenant": [ { "tenantId": "...", "summary": { } } ]
}
```

A wrong or missing token returns `401` and does no work.

## Why it is safe to fire at any time

It cannot act unless a tenant has explicitly opted in. Every job passes the same gate stack, and
each layer can only **hold** the action, never widen it:

1. **Tenant enumeration** — only tenants with an active `dispatch_router_v1` policy are even
   scanned. (A scan-scope optimisation, not an authorisation.)
2. **Kill switch** → **policy `autonomyEnabled`** — both default OFF.
3. **Token / spend ceilings** — the spend check fails *closed* on a job with an unmeasurable NTE,
   so autonomy never commits money it cannot bound.
4. **Policy conditions**, **quality bar**, and **per-client `autonomy_allowed`** (opt-in, default
   false).

With autonomy off — the default everywhere — a fired sweep scans nothing, writes nothing, and
returns `tenantsScanned: 0`. Verified in the sandbox harness.

## What bounds it once autonomy IS on

| Bound | Where | Effect |
|---|---|---|
| **Stuck filter** | `runAutoRedispatchSweep` candidate selection | only `can_suggest` (genuinely stuck) dispatches are candidates |
| **Count cap** | `REDISPATCH_MAX_ATTEMPTS = 3` | bounds TOTAL attempts per job |
| **Cooldown** | `REDISPATCH_COOLDOWN_HOURS = 4` | bounds RE-ENTRY RATE per job |

★ The stuck filter lives in the **shared sweep core**, not in `autoRedispatchForStuckAssignment`
(T1), which has no staleness check of its own. Anything that fires this sweep in future — a cron, a
queue, an external scheduler — must call `runAutoRedispatchSweep`, **never T1 directly**, or it will
re-dispatch perfectly healthy jobs.

## Sandbox harness

`scripts/testbed/eval-trigger.ts` on the `testbed-generator` branch drives this exact route handler
against the `TBSTUCK-` cohort and asserts: token guard 401s, autonomy-off writes nothing, the sweep
fires, the stuck filter holds, the count cap holds, the cooldown blocks a second immediate run, and
a `cooldownHours: 0` control proves the cooldown was the cause. It restores everything it touches.

## Deferred (not built)

- **Automated schedule.** Revisit when there is a live operation. Note that minute-level cron
  frequency requires Vercel Pro; the Hobby tier caps crons at once per day, which is too coarse for
  a 2-hour EMERGENCY threshold.
- **`CRON_SECRET` in the deployed project env.** Until it is set, the deployed route is disabled.
