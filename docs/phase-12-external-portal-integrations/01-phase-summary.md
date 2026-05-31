# Phase 12 — External Portal Integration Framework — Phase Summary

**Branch:** `phase-12-external-portal-integrations` · **Target tag:** `v1.3.0-phase-12` · **Status:** framework complete, phase-blocking harness green (25/0 @ `66b1377`), docs in progress.

Phase 12 delivered a **generic, source-agnostic external-integration framework** — the deepest exercise of the §2.1 invariant to date. An external work order from a third-party platform (ServiceChannel as the first adapter) maps **into the same `jobs` substrate** every other channel uses, via a provider-agnostic core + a per-provider adapter, with full sync/payload audit logging. **Framework only — NO live integration shipped** (per roadmap §8: "one adapter skeleton", "do NOT build full automation"). The adapter's network methods are deferred stubs; no credentials are read; no HTTP is made.

## What shipped

**Schema — 12 external_* tables across 5 migrations (0028–0032), prod-applied:**
- `external_systems` / `external_accounts` / `external_credentials` (0028) — the connection + secret substrate.
- `external_status_mappings` / `external_trade_mappings` / `external_priority_mappings` (0029) — code translation; status/trade target GLOBAL ref data, priority is tenant-scoped (F5).
- `external_work_order_links` / `external_sync_runs` / `external_sync_events` / `external_payload_logs` (0030) — the source-agnostic join + sync/audit layer.
- `external_location_mappings` (0031) — provider store ref → internal `client_location_id` (IF-2).
- `external_client_mappings` + `client_id` on `external_location_mappings` (0032) — multi-client platforms (SubscriberId→client; StoreId per-client).

**Core (`src/lib/integrations/core/`, §2.1 — core never imports an adapter):**
- `types.ts` — the `PortalAdapter` contract (normalizePayload/fetchWorkOrders/pushStatus, F8), `NormalizedWorkOrder`, `NormalizedStatusPush` (status+note only — OQ-6 typed-in), `PushResult`.
- `registry.ts` — the self-registration seam (`registerAdapter`/`getAdapter`).
- `mapping.ts` — read-only code resolution (status/trade/priority + `resolveStatusOutbound`), direction-aware (F4), priority tenant-scoped (F5).
- `ingest.ts` — the generic inbound engine (resolve→park/auto-stub/default → `createJob`@NEW → ewol link → sync log).
- `sync.ts` — shared run/event/payload helpers (`openRun`/`finalizeRun`/`logEvent`/`logPayload`) + the outbound `pushStatusToExternal`.

**Server (`src/server/integrations/`):**
- `system-user.ts` + `scripts/seed-system-user.ts` — the GLOBAL non-login service identity (SF-1) that owns system-originated records.
- `ingest-external-job.ts` — the authz wrapper (sole gate: tenantId from the system row, `createdByUserId = getSystemUserId()`).

**Adapter (`src/lib/integrations/servicechannel/`):** `adapter.ts` (real `normalizePayload`; deferred fetch/push stubs) + `index.ts` (one-line self-registration) — **zero core change to add it** (§2.1 proven).

**Harness:** `scripts/check-external-integrations.ts` — **25 assertions, phase-blocking, 25/0 green** (source-agnostic / mapping incl F5 / tenant isolation / no-credential-leak + OQ-6 / locked behaviors).

## Key invariants
- **Source-agnostic (§2.1):** an external WO is an ordinary `jobs` row (`source_type='external_client_portal'`); the core never names a provider; adding a provider = a folder + one registration line.
- **OQ-6:** the outbound surface (`NormalizedStatusPush`) cannot express cost/markup; no payload log carries margin; no credential ever enters a log.
- **F5:** priority resolution is tenant-scoped — the same external code maps to each tenant's own priority.

## Empirical close
`check-external-integrations.ts` — **25 passed / 0 failed, true exit 0** at commit `66b1377` (re-verified independently at 12k.1 after a caught-and-reset false-green). See `11-closeout.md`.

## Migration ledger
`a9b1ae7` (0028) → `86af60b` (0029) → `d85f2e4` (0030) → `c53f66e` (12f-g core) → `67f34a0` (0031) → `dcdd565` (0032) → `04965d6` (system user) → `792082d` (ingest) → `bb65d75` (sync/outbound) → `9b55e89` (adapter) → `66b1377` (harness). Prod schema: **12 external_* tables, 93 total, 33 migrations.**
