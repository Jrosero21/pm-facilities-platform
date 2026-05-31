# Phase 12 — System Workflows

## Inbound: external WO → internal job
```
ingestExternalJob({ externalSystemId, wo: NormalizedWorkOrder })   [server wrapper — SOLE authz gate]
  → load external_systems by id; tenantId = system.tenant_id (scope pin, never the payload);
    createdByUserId = getSystemUserId() (SF-1); reject unknown/inactive system
  → ingestWorkOrder(ctx, wo)   [core engine; no auth — trusts the pinned ctx]
      0. openRun('inbound_ingest') + logPayload(inbound, wo.raw)        [shared sync helpers]
      1. resolve CLIENT (external_client_mappings, SubscriberId)
           unmapped → logEvent(error) + finalizeRun(partial) → PARKED (no job, no client)  [IF-7]
      2. DEDUP (external_work_order_links by system+external_wo_id)
           exists → touch last_synced_at → SKIPPED_ALREADY_LINKED                          [IF-3]
      3. resolve LOCATION within client (external_location_mappings, StoreId/LocationId)
           unmapped → createLocation(stub, real payload address; [NEEDS REVIEW] if absent)
                      + insert external_location_mappings + flag auto_created_location       [SF-2]
      4. resolve status/trade/priority (core/mapping; F4 inbound)
           unmapped → pass undefined + flag (createJob defaults)                            [IF-1]
      5. createJob({ sourceType:'external_client_portal', sourceExternalId, primaryTradeId?,
                     priorityId?, createdByUserId })  → lands NEW (its own txn)             [IF-6]
      6. insert external_work_order_links (job_id ↔ external_wo_id, active)                 [IF-4]
      7. logEvent('wo_created', metadata.resolvedStatusId RECORDED not applied) + finalizeRun
```
The job is now an ordinary row in the operator queue — distinguishable only by `source_type` + its ewol link. The platform stays source-agnostic.

## Outbound: internal status → external (explicit, skeleton no-op)
```
pushStatusToExternal({ tenantId, jobId, note? })   [core/sync.ts — explicit; no auto-hooks IO-1]
  1. external_work_order_links by (tenant, job, active)  → none = { ok:false, JOB_NOT_EXTERNALLY_LINKED }
  2. external_systems (provider + active)               → inactive = { ok:false, … }
  3. getJob → resolveStatusOutbound(internal job_status_id → external code; F4 outbound)
                                                          → unmapped = STATUS_NOT_MAPPED_OUTBOUND
  4. openRun('outbound_push')
  5. NormalizedStatusPush { externalWoId, externalStatusCode, note }   [status+note only — OQ-6]
  6. getAdapter(provider).pushStatus(account, push)     [12j skeleton no-op → {ok:true,'noop-skeleton'}; NO creds loaded IO-2]
  7. logPayload(outbound, { push, result }) + logEvent('status_pushed') + finalizeRun         [IO-4]
```

## Adding a provider (the §2.1 demonstration)
A new provider = a new folder under `src/lib/integrations/<provider>/` (an `adapter.ts` implementing `PortalAdapter` + an `index.ts` calling `registerAdapter('<provider>', adapter)`). **Zero core change** — proven in 12j (`git diff core/` empty when ServiceChannel was added). Mapping (codes → ids) is core, not the adapter.
