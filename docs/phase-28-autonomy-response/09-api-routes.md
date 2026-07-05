# Phase 28 — API Routes / Server Actions

## New server action (Batch 1)
- **`setClientAutonomyConsentAction(clientId, _prev, formData)`** — `src/app/(app)/clients/actions.ts`. `requireTenant`; reads `value==="true"`; calls `updateClient({ patch: { autonomyAllowed } })`; `revalidatePath('/clients/[id]')`. Mirrors `setClientPriorityAction`. State type `ClientAutonomyConsentState = { error: string } | null`.

## New server function
- **`clientAutonomyConsent(tenantId, clientId): Promise<{ allowed, mustNotify }>`** — `src/server/clients.ts`. Fail-safe read for the gate (null/unresolvable → `allowed:false`; never throws).

## Extended
- **`updateClient(...)`** — `src/server/clients.ts`. `UpdateClientPatch` gains `autonomyAllowed?` and `mustNotifyClient?`; writes the `client.autonomy_consent_changed` audit on an `autonomyAllowed` change (change-only).

## Autonomous gate entrypoints (consent conjunct added; not new endpoints)
- **`autoDispatchDraftForJob(tenantId, jobId)`** — `src/server/auto-dispatch.ts`. Rule-based auto-dispatch of a NEW job; `permitted` now includes `&& consent.allowed`; `blockedBy` gains `client_autonomy_not_consented`.
- **`autoRedispatchForStuckAssignment({ tenantId, stuckAssignmentId })`** — `src/server/auto-redispatch.ts`. Autonomous escalation; same consent conjunct + `blockedBy` branch.

## Manual escalation actions (built post-27, the operator triggers today)
- **T2a — per-job "Auto-retry now"** — the stuck-exception-row action that fires `autoRedispatchForStuckAssignment` for one job.
- **T2b — tenant "Auto-retry all eligible"** — the sweep action firing T1 sequentially across all `can_suggest` stuck jobs.
- **"Suggest replacement"** — the manual rung-1 prepare (stages a re-dispatch DRAFT for hand approval).

## Not added (deferred)
- No scheduled/cron/HTTP trigger route (host-dependent, D-28.5).
- No client-notification send path (must-notify column only, D-28.4).
- No in-app policy-conditions editor route (CF-28.1; script-only today).
