# Phase 12 — Chatbot Knowledge (Phase 16 prep)

Structured knowledge for a future AI agent. AI output is always a reviewable draft; an agent operates under policy and never mutates state directly.

## What the external-integration framework is
A generic, provider-agnostic way for third-party work-order platforms (e.g. ServiceChannel, Corrigo) to feed work orders **into** the platform and receive status updates **out** — without the core knowing about any specific provider. An external WO becomes an ordinary internal `jobs` row; the platform stays source-agnostic (a job's channel is just its `source_type`).

## Core concepts
- **external_systems** — a registered integration (per tenant; `provider` is a string like `servicechannel`).
- **external_accounts / external_credentials** — connection identity + secrets (secrets unused in MVP; never logged).
- **mappings** — translate a provider's codes to our ids: `external_client_mappings` (SubscriberId→client), `external_location_mappings` (StoreId→client_location, per client), `external_status/trade/priority_mappings` (codes→ref ids). Status/trade map to GLOBAL ref data; priority is per-tenant.
- **external_work_order_links** — the join: a provider WO id ↔ our `jobs.id`. The dedup key.
- **external_sync_runs / _events / _payload_logs** — the audit trail of every sync (what came in, what happened, the raw payload).

## How an external WO becomes a job (inbound)
Resolve client (unmapped → **parked**, no job created) → dedup (already linked → skip) → resolve location (unmapped → auto-create a stub from the WO address) → resolve status/trade/priority (unmapped → default + flag) → create the job at **NEW** → link it → log. The provider's status is recorded for triage but the job always starts NEW (operators advance it).

## Outbound
`pushStatusToExternal(jobId)` maps the job's current status to the provider's code and hands a status+note (never cost/markup) to the provider adapter. In MVP the adapter is a no-op skeleton (no live HTTP).

## Adapter pattern (how providers are added)
Each provider is a folder implementing a shared `PortalAdapter` (normalizePayload / fetchWorkOrders / pushStatus) and self-registering into the core. Adding one needs no core change. ServiceChannel is the first, as a skeleton.

## MVP vs deferred (an agent must know the boundary)
- **Built:** the schema (12 tables), the generic core, inbound ingest, the outbound path, the ServiceChannel skeleton, a 25-assertion harness.
- **Deferred:** any LIVE integration (no HTTP, no credentials used), auto-push-on-change, operator mapping UIs, encryption-at-rest for credentials. An agent must not claim the platform is live-integrated or expose any credential/margin field.
