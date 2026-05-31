# Phase 12 — Business Rules

Every rule below is exercised by `scripts/check-external-integrations.ts` (25 assertions, group letters cited).

## Source-agnostic (§2.1)
- **R-12.1** — an external WO becomes an ordinary `jobs` row: `source_type='external_client_portal'`, `source_external_id` = the provider WO id, linked via `external_work_order_links`. *(Harness A1/A2.)*
- **R-12.2** — the core never imports a concrete adapter; `provider` is a varchar; adding a provider needs zero core change (a folder + one `registerAdapter` line). *(12j: `git diff core/` empty; harness E4.)*
- **R-12.3** — code-mapping is a CORE concern, not the adapter's; the adapter only speaks the provider wire format. *(F8.)*

## Mapping
- **R-12.4** — status + trade resolve to GLOBAL reference ids; priority resolves to the **acting tenant's** priority (F5). The same external priority code maps to each tenant's own priority — no cross-tenant contamination. *(Harness B1/B2/B3/B4.)*
- **R-12.5** — resolution is direction-aware (F4): inbound matches `inbound`/`both`; outbound matches `outbound`/`both`.

## Intake behaviors
- **R-12.6 (IF-7)** — an unmapped CLIENT parks the WO: a `sync_event` error + a payload log, **no job and no client created**. *(Harness E1.)*
- **R-12.7 (auto-stub)** — an unmapped LOCATION (under a mapped client) auto-creates a `client_location` stub from the WO's real address (`[NEEDS REVIEW]` only where a field is genuinely absent), maps it, flags it, and the job proceeds. *(Harness E2/E2b.)* The asymmetry vs R-12.6 is deliberate: a client is a billing relationship (never auto-created); a location is a sub-detail of an already-trusted client.
- **R-12.8 (IF-6)** — external jobs land at NEW; the mapped status is RECORDED on the `wo_created` sync event, **never auto-applied** (no silent status advance — R-5.8). *(Harness A3/A4.)*
- **R-12.9 (IF-1)** — an unmapped status/trade/priority never rejects or silently drops; the job is created with a default and a flag. *(Harness B/E.)*
- **R-12.10 (IF-3)** — re-ingesting an already-linked external WO is idempotent: skip + touch `last_synced_at`, no duplicate job. *(Harness E3.)*
- **R-12.11 (IF-4)** — `createJob` (its own txn) commits, then the ewol link is inserted; the ewol unique `(external_system_id, external_wo_id)` is the idempotency guard. The orphan window (job created before link) is a documented limitation.

## Security / confidentiality
- **R-12.12 (OQ-6)** — the outbound surface (`NormalizedStatusPush`) carries status + note ONLY; no payload log or sync event carries cost/markup/margin/subtotal/total. Margin is structurally un-leakable outbound. *(Harness D4/D5.)*
- **R-12.13 (no-credential-leak)** — credentials NEVER enter `external_payload_logs` or any log/event; the skeleton push loads no credentials. *(Harness D1/D2/D3/E5.)*
- **R-12.14 (authz pin)** — `ingestExternalJob` is the sole authz gate: tenantId is derived from the `external_systems` row (never the payload); `createdByUserId` is the system user. Cross-tenant operations fail (a push for another tenant's job → `JOB_NOT_EXTERNALLY_LINKED`). *(Harness C2/C3/C4.)*
- **R-12.15 (tenant isolation)** — a system's mapping queries return only that system's (and thus that tenant's) rows; every external_* row carries the correct `tenant_id` (the 9 tenant-carrying tables). *(Harness C1/C4.)*

## FK / data-lifecycle (08-db-changes for full matrix)
- **R-12.16** — `external_systems.created_by_user_id` is SET NULL on user delete (preserve the integration record, D-12c.1); `external_work_order_links.job_id` + `external_payload_logs.sync_run_id` are SET NULL (audit-preservation); all tenant/system FKs + `external_sync_events.sync_run_id` cascade.
