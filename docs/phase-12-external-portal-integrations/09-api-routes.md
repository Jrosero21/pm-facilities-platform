# Phase 12 — Server Entry Points

**No HTTP routes** — Phase 12 is a framework, not a live endpoint surface. The entry points are server functions; the webhook/poll wiring that would call them lands in the live-integration phase.

## Inbound
- **`ingestExternalJob({ externalSystemId, wo })`** — `src/server/integrations/ingest-external-job.ts`. The SOLE authz/scope gate: loads the `external_systems` row (`EXTERNAL_SYSTEM_NOT_FOUND` / `EXTERNAL_SYSTEM_INACTIVE`), derives `tenantId` from it (never the payload), sets `createdByUserId = await getSystemUserId()`, delegates to the engine. Returns `IngestResult` (`parked_unmapped_client` | `skipped_already_linked` | `ingested`).
- **`ingestWorkOrder(ctx, wo)`** — `src/lib/integrations/core/ingest.ts`. The generic engine (no auth; trusts the pinned ctx).

## Outbound
- **`pushStatusToExternal({ tenantId, jobId, note? })`** — `src/lib/integrations/core/sync.ts`. Resolves the external system via the job's ewol link, maps the status outbound, calls the adapter (skeleton no-op), logs run/event/payload. Returns `PushResult`.

## Core (`src/lib/integrations/core/`)
- `types.ts` — `PortalAdapter`, `NormalizedWorkOrder`, `NormalizedStatusPush`, `PushResult`, `ExternalAccount`.
- `registry.ts` — `registerAdapter(provider, adapter)`, `getAdapter(provider)`, `hasAdapter`, `listRegisteredProviders`.
- `mapping.ts` — `resolveStatus` / `resolveTrade` / `resolvePriority` / `resolveWorkOrderCodes` (inbound) + `resolveStatusOutbound` (outbound).
- `sync.ts` — `openRun` / `finalizeRun` / `logEvent` / `logPayload` + `pushStatusToExternal`.

## Adapter (`src/lib/integrations/servicechannel/`)
- `adapter.ts` — `serviceChannelAdapter` (real `normalizePayload`; `fetchWorkOrders`→`[]`, `pushStatus`→`{ok:true,'noop-skeleton'}` deferred stubs).
- `index.ts` — self-registers `'servicechannel'` at import.

## Service identity
- **`getSystemUserId()`** — `src/server/integrations/system-user.ts`. By-email resolver for the GLOBAL non-login service user (throws `SYSTEM_USER_NOT_SEEDED` if absent). Seeded by `scripts/seed-system-user.ts`.

## Error vocabulary
`EXTERNAL_SYSTEM_NOT_FOUND`, `EXTERNAL_SYSTEM_INACTIVE`, `SYSTEM_USER_NOT_SEEDED`, `JOB_NOT_EXTERNALLY_LINKED`, `STATUS_NOT_MAPPED_OUTBOUND`, `NO_EXTERNAL_ACCOUNT`, `UNKNOWN_PROVIDER` (registry). Plus the reused Phase-4 `createJob` errors surfaced through ingest.
