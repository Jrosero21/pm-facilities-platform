# Phase 13a — Inspection Report (email ingestion)

**Branch:** `phase-13-email-ingestion` (off `main@c7f81da`). Read-only sweep — no schema, no migration, no commit. Mirrors 12a.

> **DB-VERDICT STATUS — COMPLETE (tunnel re-opened; all four owed verdicts run live against `jonnyrosero_pm`).** Results folded into §2, §3, §6, §7 below. Headline: source_type enum confirmed (both values present); the **six Phase-13 tables are net-new**, BUT the `email_*`/`inbound_*` *namespace is not empty* — Phase 6 already owns `email_templates` + `inbound_messages` (naming watchpoint, §3); `clients` has no email/domain column (confirmed) but DOES carry `client_code varchar(64)`; all 12 `external_*` mapping/sync tables present to mirror.

## 1. Substrate orientation (what Phase 13 reuses, not duplicates)
- **Migrations** through `0032` (`db/migrations/0028…0032`); **`0033` is free** — Phase 13's first migration.
- **Integration core** (`src/lib/integrations/core/`): `types.ts`, `registry.ts`, `mapping.ts`, `ingest.ts`, `sync.ts`. One adapter folder: `servicechannel/`.
- **Server integration layer** (`src/server/integrations/`): `ingest-external-job.ts` (the authz/scope wrapper), `system-user.ts` (SF-1 service identity).
- These are the **direct precedent** for Phase 13: an email is just another *source* that normalizes into the same job substrate. The §2.1 source-agnostic invariant means email ingestion should be a **new sibling source path**, not a fork of the external-portal one.

## 2. `jobs.source_type` enum — the channel the framework hangs on
**Verdict (from schema source + migration trail): the enum ALREADY carries both Phase-13 values.** No enum-extending migration is a prerequisite (pending live-DB confirm — §7).

Current `src/server/schema/jobs.ts` (`sourceType`):
```
"manual", "internal_client_portal", "external_client_portal",
"email_ingestion", "forwarded_email",
"api", "preventative_maintenance", "snow_event"
```
- Set once by migration **`0008_mature_guardsmen.sql`** (the jobs table create) with `email_ingestion` + `forwarded_email` both present.
- The other `source_type` migrations are **different tables** (collision, not jobs): `0010` = `communication_logs`, `0012` = `update_rewrite_drafts`, `0020` = `vendor_invoices` (its own enum: `manual/vendor_portal/email_ingestion/external_portal_sync/api`). `0024` only adds index `jobs_tenant_source_idx (tenant_id, source_type)` — no enum change.
- **Caveat to confirm live:** `vendor_invoices.source_type` (0020) carries `email_ingestion` but NOT `forwarded_email` — if Phase 13 ever sets a vendor-invoice source to a forwarded email, that enum would need extending. Out of scope for inbound-WO ingestion, flagged for completeness.

## 3. Email scaffolding — net-new confirmation
- **No Phase-13 tables exist in schema source.** The grep for `email_ingestion|inbound_email|email_parse|work_order_draft|email_attachment|email_parser_rule` matched ONLY the `source_type` enum literals above (in `jobs.ts`, `vendor-invoices.ts`, `0008`, `0020`) — i.e. the channel value, never a table.
- Broad token scan (`inboundEmail|parseResult|emailDraft|emailIngestion|parser_rule|parseConfidence`) → **zero matches.** No latent parser/draft scaffolding.
- **Conclusion:** the six roadmap email_* tables are genuinely net-new.
- **⚠ LIVE-DB NUANCE (confirmed):** `information_schema` LIKE `'email\_%' OR 'inbound\_%'` is **NOT empty** — it returns **`email_templates`** + **`inbound_messages`** (both Phase-6 communication tables, migrations 0010/0011). Neither is a Phase-13 table; none of the six proposed names collides with them. **But the `email_*`/`inbound_*` namespace is shared** — Phase-13 table names must avoid those two and read unambiguously as ingestion (e.g. `inbound_emails` is distinct from `inbound_messages`, but the proximity is a naming-clarity watchpoint → **WP-13.1**). The six proposed names remain free.

## 4. `createJob` — the draft→job precedent (`src/server/jobs.ts:236`)
- `CreateJobInput` accepts `sourceType?: JobSourceType` + `sourceExternalId?` — so an email-originated job sets `sourceType='email_ingestion'` (or `'forwarded_email'`) + `sourceExternalId=<message-id>` with **no signature change**.
- Pre-txn **parent-in-tenant guards** (read-only): `CLIENT_NOT_FOUND`, `LOCATION_NOT_FOUND`, `LOCATION_CLIENT_MISMATCH`, `PRIORITY_NOT_FOUND` (if given), `TRADE_NOT_FOUND` (if given), `STATUS_NOT_FOUND` (defensive).
- **Status is hardcoded NEW** (`INITIAL_STATUS_CODE`) — same IF-6 landing as external ingest; a mapped/parsed status would be recorded for triage, never auto-applied (R-5.8).
- 7-step **single txn**: ensure+lock `tenant_job_sequences` (`FOR UPDATE`) → insert job → bump counter → status-history row → `job.created` timeline event → **audit row INSIDE the txn** (direct `tx.insert(auditLogs)`, not `writeAuditLog`). NTE resolution folded in (8c.4).

## 5. `ingestExternalJob` — the thin-wrapper precedent (`src/server/integrations/ingest-external-job.ts`)
The shape Phase 13's email→job path should mirror:
- **Sole authz/scope gate**: loads the source row (Phase 12: `external_systems`), derives `tenantId` **from that row, never the payload**, rejects unknown/inactive before any write.
- `createdByUserId = await getSystemUserId()` — the **SF-1 global system user** (`integration@system.internal`, plain `users` row, no auth/password, resolved by email; throws `SYSTEM_USER_NOT_SEEDED`). A non-login service identity is exactly what an unattended email-ingest writer also needs (no acting human). **Reusable as-is.**
- Delegates to `ingestWorkOrder(ctx, wo)` — the generic engine that does **no auth**, trusts the pinned ctx.

## 6. Entity-resolution surfaces — how an email resolves to client/location/trade
**Key finding (LIVE-CONFIRMED): `clients` has NO email/domain column.** Live columns: `id, tenant_id, name, client_code varchar(64) (nullable), status enum(active/inactive/archived), created_by_user_id, created_at, updated_at`. So sender→client cannot be keyed off the clients table directly — resolution needs a **mapping table or parser rule** (the central Phase-13 fork, design proposal I-2). Note `client_code` exists (a per-tenant short code) but is **not** an email/domain key — it could be a *parser-rule target* (sender domain → client_code → client) but isn't itself the sender signal.

Email columns that DO exist in schema source (potential resolution signals, none authoritative for sender→client):
- `client-details.ts` (×2 — client contacts), `job-details.ts` (job contact), `vendors.ts` (vendor contact), `auth.ts` (`users.email`, unique). `communications.ts` has `email` as a **channel** enum value, not an address.
- **The Phase-12 analog to mirror:** `external_client_mappings (external_system_id, external_code) → client_id` + `external_location_mappings` (per-client `external_code → client_location_id`). Phase 13's equivalent is "sender address/domain → client" + "parsed location token → client_location" — a mapping table family, not a new column on `clients`.
- **Resolver to reuse:** `core/mapping.ts` (`resolveStatus`/`resolveTrade`/`resolvePriority`/`resolveWorkOrderCodes`, direction-aware F4, priority tenant-scoped F5, unmapped → `{matched:false}` never thrown). An email parser produces the same code-bearing neutral DTO and can drive the **same resolver** if its codes land in mapping tables.
- **Neutral DTO precedent:** `NormalizedWorkOrder` (`core/types.ts`) — `externalWoId / externalClientCode / externalLocationCode` (required) + optional status/trade/priority codes + location-detail block + `raw`. An email parser's output is structurally the same DTO (or a close sibling); `raw` carries the original message for the payload log.

## 7. Patterns to mirror + **OWED live-DB confirmations**
**Available to mirror (read from source):**
- **History/log substrate** — `core/sync.ts`: `openRun`/`finalizeRun`/`logEvent`/`logPayload` (run_type string, outcome ok/skipped/error, **never logs credentials**, IO-4). An email-ingest run is `run_type='email_ingest'` over the same primitives. The `external_sync_events.sync_run_id` NOT-NULL+FK lesson (open a real run per ingest) carries over.
- **Ingest flow to mirror** — `core/ingest.ts`: client-resolve→park (IF-7) / dedup skip+touch (IF-3) / location auto-stub (SF-2) / codes default+flag (IF-1) / createJob@NEW (IF-6) / link (IF-4) / sync log. The IF-4 orphan-window known-limitation applies identically.
- **MariaDB-JSON parse-at-read precedent** — emails carry JSON-ish payloads (headers, parse results). Existing boundary-parse precedents: `billing/events.ts:153` (`parseMetadata`), `agents/drafts.ts:112`, `agents/scope-generator/drafts.ts`. **Any json column an email table exposes on read must JSON.parse at the boundary** (drizzle/mysql2 returns the raw string).

**RESOLVED — all four run live against `jonnyrosero_pm` (tunnel re-opened):**
1. ✅ **`jobs.source_type` live enum** = `enum('manual','internal_client_portal','external_client_portal','email_ingestion','forwarded_email','api','preventative_maintenance','snow_event')` — **both `email_ingestion` AND `forwarded_email` present.** No enum-extending migration is a Phase-13 prerequisite. The framework's hang point is clear.
2. ✅ **email_*/inbound_* tables** — net-new CONFIRMED for the six proposed names, with the nuance in §3: the namespace already holds `email_templates` + `inbound_messages` (Phase-6), neither colliding. → **WP-13.1** (naming clarity).
3. ✅ **`clients` columns** — NO `email`/`domain` column (live-confirmed, §6). Carries `client_code varchar(64)` (nullable) — a possible parser-rule target, not a sender key.
4. ✅ **`portal_update_queue` + `audit_logs` shapes:**
   - `portal_update_queue` (Phase-6 6f forward-decl, send-queue): `id, tenant_id, job_id, target_portal enum(client_portal/vendor_portal/external_portal), source_type varchar(32), source_id varchar(36), queue_status enum(queued/processing/sent/failed/cancelled), attempts int, scheduled_at, processed_at, last_error text, status, created_at, updated_at`. **Polymorphic `source_type`+`source_id`** is exactly the shape an email-originated outbound update would enqueue against — reuse candidate, no `external_portal`-style email value yet.
   - `audit_logs`: `id, tenant_id, user_id, actor_label varchar(128), action varchar(128), target_type varchar(64), target_id varchar(36), metadata longtext, ip_address, user_agent, created_at`. The `actor_label` column lets a system-originated email-ingest audit row read clearly even with the SF-1 user_id; `metadata` is `longtext` (JSON-at-read applies).
5. ✅ **`external_*` inventory** (mapping analog to mirror) — all 12 present: `external_accounts, external_client_mappings, external_credentials, external_location_mappings, external_payload_logs, external_priority_mappings, external_status_mappings, external_sync_events, external_sync_runs, external_systems, external_trade_mappings, external_work_order_links`.

## Summary
Phase 13 is a **net-new email-ingestion source that rides the Phase-12 substrate**: same `createJob` landing, same system-user attribution, same sync/log primitives, same direction-aware mapping resolver, same JSON-at-read discipline. The one genuinely new problem is **sender→client/location resolution** (no email/domain on `clients`), which needs a mapping/parser-rule family — the central design fork. Live-DB verdicts (§7) are owed before schema is locked.
