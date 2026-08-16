# Phase 29 — API Routes / Server Actions

## NEW — `/api/cron/auto-redispatch`
`src/app/api/cron/auto-redispatch/route.ts`

| | |
|---|---|
| **Methods** | `GET` and `POST` — both export the same `handle` |
| **Auth** | `Authorization: Bearer $CRON_SECRET` |
| **Runtime** | `dynamic = "force-dynamic"` (never cached — it mutates), `maxDuration = 300` |
| **Unset `CRON_SECRET`** | endpoint **disabled** — fails closed, never open |
| **Bad / missing token** | `401 {"error":"unauthorized"}`, no work done, nothing leaked about why |

**`isAuthorized(request)`** — constant-time via `timingSafeEqual`, with both presented and expected
secrets **SHA-256'd first** so the comparison runs on fixed-length buffers. Comparing raw secrets
would leak the secret's length through `timingSafeEqual`'s length-mismatch throw.

**`tenantsToScan()`** — `selectDistinct` over `agent_policies` where `agentId = 'dispatch_router_v1'`
and `status = 'active'`. A **scan-scope optimisation, not an authorisation decision**: omitting a
tenant can only mean less work, never more permission.

**`handle()`** — guard → enumerate → iterate tenants **sequentially** (`runAutoRedispatchSweep({
tenantId, now: startedAt })`), accumulating `totals` and `perTenant`. A per-tenant throw is caught,
tallied as `tenant_error`, logged, and the run continues.

**Response (200):**
```json
{ "ok": true, "startedAt": "ISO", "durationMs": 1234, "tenantsScanned": 1,
  "totals": { "swept": 0, "autoSent": 0, "heldForReview": 0, "skipped": 0, "byReason": {} },
  "perTenant": [ { "tenantId": "…", "summary": { } } ] }
```

Path and header format deliberately match what Vercel Cron sends, so adding a schedule later needs
**no change to this file**.

## NEW — `runAutoRedispatchSweep` (server module, not a route)
`src/server/auto-redispatch-sweep.ts`

```ts
export const REDISPATCH_COOLDOWN_HOURS = 4;

export type SweepSummary = {
  swept: number; autoSent: number; heldForReview: number; skipped: number;
  byReason: Record<string, number>;
};

export async function runAutoRedispatchSweep(input: {
  tenantId: string;
  now?: Date;
  cooldownHours?: number;   // real caller parameter, not a test backdoor
}): Promise<SweepSummary>;
```
Session-free — no `requireTenant`, no `revalidatePath` — so a route, a script, or an action can all
drive it. Owns the `can_suggest` **stuck-filter** and the **cooldown**; adds no permission (T1
re-resolves every gate per job and can only hold).

★ Its candidate loop is **sequential and must stay so** — see D-29.4 / R-29.5.

## REFACTORED — `autoRedispatchSweepAction`
`src/app/(app)/notifications/actions.ts` (−38 lines)

The loop body moved **verbatim** into `runAutoRedispatchSweep`. The action now keeps only its
request-scoped concerns:
```ts
const ctx = await requireTenant();
const summary = await runAutoRedispatchSweep({ tenantId: ctx.activeTenant.tenantId });
revalidatePath("/notifications");
return { ok: true, summary };
```
**Behaviour change for the button:** it now also applies the per-job cooldown — a job auto-re-dispatched
within `REDISPATCH_COOLDOWN_HOURS` is skipped as `cooldown`. Everything else is unchanged.

## Unchanged
`autoRedispatchForStuckAssignment` (T1), `prepareRedispatchSuggestion`, `decideRedispatchCore`,
`REDISPATCH_MAX_ATTEMPTS` — all Phase 28, untouched by this phase.
