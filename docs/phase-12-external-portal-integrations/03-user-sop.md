# Phase 12 — Operator SOP (external-sourced jobs)

The intended operator workflow once an external integration is **live**. Phase 12 ships the framework; the operator UIs named below are **deferred** (the mapping rows they'd manage exist; the screens don't yet). Until a live adapter is wired, this is the shape the operator work will take.

## How an external work order becomes a job
When the integration is live, a provider work order is ingested automatically: it resolves the provider's client (SubscriberId) and location (LocationId/StoreId) to your internal client + location, creates a `jobs` row at status **NEW** (`source_type='external_client_portal'`), and links it via `external_work_order_links`. It enters your normal operator queue like any other job — triage trade/priority/NTE as usual.

## Reviewing a PARKED work order (unmapped client)
If a WO arrives for a provider client (SubscriberId) you haven't mapped, it is **parked** — **no job is created** (a client is never auto-created). It is recorded as an error `external_sync_events` row + a raw `external_payload_logs` row.
- **To resolve:** map the SubscriberId → your internal client (in the integration settings — UI deferred; today it's an `external_client_mappings` row). Re-running the sync then ingests the WO normally.

## Reviewing an AUTO-CREATED location (unmapped location)
If a WO's client is mapped but its location (StoreId) isn't, the job proceeds and a **stub `client_location` is auto-created** from the WO's address, mapped, and flagged `auto_created_location` (+ `location_needs_review` if any address field was missing → it shows `[NEEDS REVIEW]`).
- **To resolve:** open the stub location, verify its name/address against the provider's record, and replace any `[NEEDS REVIEW]` placeholder with the real value. The location mapping is already in place for future WOs at that store.

## Reading the recorded (not applied) external status
The provider's status is **resolved and recorded** on the `wo_created` sync event's metadata (`resolvedStatusId`) for triage — but the job **lands at NEW regardless** (IF-6). The platform never auto-advances a job's status on intake; you advance it deliberately through the normal status workflow. The recorded external status is informational context, not an applied state.

## Unmapped trade / priority
If a WO's trade or priority code isn't mapped, the job is still created (trade/priority left for you to classify) and a flag (`unmapped_trade` / `unmapped_priority`) is recorded on the sync event for review. Add the mapping so future WOs resolve automatically.
