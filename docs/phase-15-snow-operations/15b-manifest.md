# Phase 15 — Snow Operations · 15b Manifest (PLANNING ONLY)

> Planning artifact. No schema, migrations, engine, or DB writes were produced; no
> commit. All MySQL read-only via `~/.pm_db.cnf`, DB `jonnyrosero_pm` named
> explicitly (WP-12.1), `-E` vertical. This manifest rests on four verified facts
> (VERIFY 1–4 below) and the locked fork resolutions from 15a. DDL is authored in
> **15c** (one migration per cycle).

Branch: `phase-15-snow-operations`.

---

## 0. Verified empirical facts (the manifest's foundation)

| # | Fact | Verdict |
|---|---|---|
| V1 | Next free migration number | Latest applied = **0038** (`0038_amusing_ser_duncan`, journal idx 38). **Next free = 0039.** ✓ |
| V2 | FK auto-naming risk (WP-12.2) | pm_* tables **hand-name every FK** via `foreignKey({columns, foreignColumns, name}).onDelete(...)`. `pm.ts:34` comment states this explicitly. Longest live name = `fk_pm_gen_runs_created_by` (**25 chars**). Convention: `fk_<table-abbrev>_<target>`; tenant→`cascade`, parent refs→`restrict`, created_by→`set null`. **→ snow_* FKs MUST be hand-named.** ✓ |
| V3 | createJob required params | Required: `tenantId`, `clientId`, `clientLocationId`, `problemDescription`, `createdByUserId`. Optional: `primaryTradeId`, `priorityId`, `sourceType` (default `manual`), `sourceExternalId`. **→ the snow fan-out must carry client/location/trade/priority down to the spawn point.** ✓ |
| V4 | client_locations PK type | `id` = **varchar(36)** (uuidv7, WP-14.1). **→ `snow_sites.client_location_id` = varchar(36).** ✓ |

---

## 1. LOCKED DECISIONS (F15-A … F15-I)

The following are **LOCKED — do not re-open**:

- **F15-A — LOCKED:** Per-program `auto_dispatch` flag selects mode; **default = STAGE**
  (operator batch-confirm), `auto` opt-in. Mirrors PM's `auto_generate` / `mode` branch.
- **F15-B — LOCKED:** `snow_sites` is an **OVERLAY** on `client_locations`
  (`client_location_id` FK + snow attrs), not a duplicate location entity.
- **F15-C — LOCKED:** `snow_dispatches` is the per-site **spawn/OUTCOME record**
  (`job_id` + `skip_reason`), **NOT** a parallel vendor-assignment table. The spawned
  job reuses the existing Phase-5 dispatch workflow (`job_vendor_assignments`).
- **F15-D — LOCKED:** **Manual event fire** only; `snow_service_triggers` models the
  rule, but live **weather eval defers** (`snow_weather_observations` is a placeholder).
- **F15-E — LOCKED:** Fan-out chain = `snow_event → N snow_event_sites → N snow_dispatches`,
  each dispatch spawning a `createJob(sourceType='snow_event')` that dispatches via the
  existing flow. `snow_event_sites` is the `pm_visits` analog (per-site batch artifact).
- **F15-F — LOCKED:** `snow_service_logs` follows the template→instance split (CF-14.1
  analog); **schema lands (0041) but capture runtime defers** (B-15.1).
- **F15-G — LOCKED:** `snow_events` is the **batch-run header** (the `pm_generation_runs`
  analog at event scale); per-site **skip-and-flag**, no outer txn (IF-4 — `createJob`
  owns its txn, V3).
- **F15-H — LOCKED:** Phase 15 = the **engine** (event-fire → fan-out → per-site spawn →
  existing dispatch), harness-driven; **mass-op UI defers** to operator-portal (B-15.3).
- **F15-I — LOCKED:** Harness storm **reuses sandbox `client_locations`** (Acme's 4 sites)
  as fan-out targets; only snow overlay attrs are seeded distinctly.

---

## 2. MIGRATION GROUPING (3 migrations, dependency-tiered)

Three migrations, each pointing FKs only at tables already on prod when it runs.

### 0039 — program + site layer
*(FKs point only at existing tables: `tenants`, `clients`, `trades`, `priorities`, `users`, `client_locations`)*

| Table | Purpose (1 line) | FK targets | All targets on prod pre-0039? |
|---|---|---|---|
| `snow_programs` | Per-client snow program (client + trade + priority + `auto_dispatch` flag) — the spawn-template, the `pm_programs` analog. | `tenants`, `clients`, `trades`, `priorities`, `users` | **Yes** (all Phase ≤5). |
| `snow_sites` | Overlay on `client_locations` with snow attrs (the F15-B membership/attribute layer). | `tenants`, `client_locations`, `snow_programs` | **Yes** — `snow_programs` is created in the SAME migration, ordered first. |
| `snow_service_triggers` | Trigger-rule model (manual-fire now; threshold fields parked for B-15.2). | `tenants`, `snow_programs` | **Yes** — same migration, `snow_programs` first. |

### 0040 — event + fan-out layer
*(FKs point at 0039 tables + existing `jobs`)*

| Table | Purpose (1 line) | FK targets | All targets on prod pre-0040? |
|---|---|---|---|
| `snow_events` | Batch-run **header** for one storm (status, requested/dispatched/skipped counts) — the `pm_generation_runs` analog (F15-G). | `tenants`, `snow_programs` | **Yes** — `snow_programs` on prod after 0039. |
| `snow_event_sites` | Per-site fan-out membership for an event (the `pm_visits` analog). | `tenants`, `snow_events`, `snow_sites` | **Yes** — `snow_events` same migration (first); `snow_sites` from 0039. |
| `snow_dispatches` | Per-site **spawn/outcome** record (`job_id` nullable until spawned, `skip_reason`, `dispatch_status`) — F15-C. | `tenants`, `snow_event_sites`, `jobs` | **Yes** — `snow_event_sites` same migration; `jobs` since Phase 4. |

### 0041 — capture + placeholder layer
*(FKs point at 0040 tables)*

| Table | Purpose (1 line) | FK targets | All targets on prod pre-0041? |
|---|---|---|---|
| `snow_service_logs` | Proof-of-service capture per dispatch (schema lands; runtime defers — B-15.1). | `tenants`, `snow_dispatches` | **Yes** — `snow_dispatches` on prod after 0040. |
| `snow_weather_observations` | **Placeholder** for the deferred live weather feed (B-15.2); no runtime reads it in Phase 15. | `tenants`, `snow_sites` (or `snow_events`) | **Yes** — both on prod after 0040. |

**Intra-migration ordering rule:** within each migration, parent tables are emitted
before children (drizzle `db:generate` orders by dependency, but the manifest fixes the
intent: 0039 = `snow_programs` → `snow_sites`/`snow_service_triggers`; 0040 = `snow_events`
→ `snow_event_sites` → `snow_dispatches`; 0041 = `snow_service_logs`, `snow_weather_observations`).

---

## 3. PRE-NAMED FK CONSTRAINTS (WP-12.2)

Hand-named per the verified pm_* convention (`fk_<abbrev>_<target>`, `.onDelete(...)`).
Table abbreviations: `sprog`=snow_programs, `ssite`=snow_sites, `strig`=snow_service_triggers,
`sevent`=snow_events, `ses`=snow_event_sites, `disp`=snow_dispatches, `slog`=snow_service_logs,
`sweather`=snow_weather_observations. All lengths well under the 64-char limit.

| Table.column | Constraint name | len | onDelete |
|---|---|---|---|
| snow_programs.tenant_id | `fk_sprog_tenant` | 15 | cascade |
| snow_programs.client_id | `fk_sprog_client` | 15 | restrict |
| snow_programs.primary_trade_id | `fk_sprog_trade` | 14 | restrict |
| snow_programs.priority_id | `fk_sprog_priority` | 17 | restrict |
| snow_programs.created_by_user_id | `fk_sprog_created_by` | 19 | set null |
| snow_sites.tenant_id | `fk_ssite_tenant` | 15 | cascade |
| snow_sites.client_location_id | `fk_ssite_location` | 17 | restrict |
| snow_sites.snow_program_id | `fk_ssite_program` | 16 | cascade |
| snow_service_triggers.tenant_id | `fk_strig_tenant` | 15 | cascade |
| snow_service_triggers.snow_program_id | `fk_strig_program` | 16 | cascade |
| snow_events.tenant_id | `fk_sevent_tenant` | 16 | cascade |
| snow_events.snow_program_id | `fk_sevent_program` | 17 | restrict |
| snow_events.created_by_user_id | `fk_sevent_created_by` | 20 | set null |
| snow_event_sites.tenant_id | `fk_ses_tenant` | 13 | cascade |
| snow_event_sites.snow_event_id | `fk_ses_event` | 12 | cascade |
| snow_event_sites.snow_site_id | `fk_ses_site` | 11 | restrict |
| snow_dispatches.tenant_id | `fk_disp_tenant` | 14 | cascade |
| snow_dispatches.snow_event_site_id | `fk_disp_event_site` | 18 | cascade |
| snow_dispatches.job_id | `fk_disp_job` | 11 | set null |
| snow_service_logs.tenant_id | `fk_slog_tenant` | 14 | cascade |
| snow_service_logs.snow_dispatch_id | `fk_slog_dispatch` | 16 | cascade |
| snow_weather_observations.tenant_id | `fk_sweather_tenant` | 18 | cascade |
| snow_weather_observations.snow_site_id | `fk_sweather_site` | 16 | restrict |

**Longest proposed name = 20 chars** (`fk_sevent_created_by`) < 64. **Zero flags.**
(Within the live pm_* max of 25; the repo's `db:check:migration-identifiers` >64 guard
will pass.) `snow_dispatches.job_id` uses `set null` so a deleted job doesn't cascade-delete
the dispatch outcome record (the skip/spawn history is preserved).

---

## 4. COLUMN INTENT (shape only — NOT final DDL; 15c authors DDL)

> Planning-level intent for 15c review. Every table: PK `id` varchar(36) uuidv7,
> `tenant_id` varchar(36) (tenant-scoped), `created_at`/`updated_at` timestamps.
> FK columns per §3. Listed below are the **decision-bearing** columns only.

**snow_programs** — `client_id`, `primary_trade_id`, `priority_id`, `name`,
`scope_of_work` (template scope), **`auto_dispatch` boolean (default false = STAGE)**,
`is_active` boolean, `created_by_user_id`. *(Carries V3's client/trade/priority for spawn.)*

**snow_sites** — `client_location_id` (the overlay FK, V4 varchar(36)),
`snow_program_id`, snow attrs: `surface_type`, `lot_size_sqft`, `service_tier`,
`plow_spec`/`salt_spec` (shape TBD 15c), `is_active` boolean.

**snow_service_triggers** — `snow_program_id`, `trigger_type` enum
(`manual` | `weather_threshold` — only `manual` active in P15), parked threshold fields
(`snowfall_inches`, `accumulation_inches` — nullable, B-15.2), `is_active`.

**snow_events** — `snow_program_id`, **`status` enum (batch-run header: e.g.
`declared` | `dispatching` | `completed` | `cancelled`)**, `requested_count`,
`dispatched_count`, `skipped_count`, `declared_at`, `fired_at`, `created_by_user_id`.
*(The pm_generation_runs analog at event scale, F15-G.)*

**snow_event_sites** — `snow_event_id`, `snow_site_id`, **`status` enum
(`pending` | `dispatched` | `skipped`)**, `skip_reason` nullable. *(The pm_visits analog.)*

**snow_dispatches** — `snow_event_site_id`, **`job_id` varchar(36) nullable (null until
spawned, V3/F15-C)**, **`dispatch_status` enum (`staged` | `spawned` | `skipped`)**,
**`skip_reason` text nullable**, `spawned_at` nullable, `source_external_id` (the
`snow:<eventId>:<siteId>` stamp passed to createJob).

**snow_service_logs** — `snow_dispatch_id`, **proof-of-service fields: `captured_at`
nullable, `photo_refs` json, `notes` text, `gps_lat`/`gps_lng`** — schema lands; capture
runtime defers (B-15.1). No engine writes these in P15.

**snow_weather_observations** — `snow_site_id`, `observed_at`, `snowfall_inches`,
`accumulation_inches`, `source` — **placeholder**, no P15 runtime reads/writes it (B-15.2).

*(All column lists above are INTENT for 15c review, not DDL.)*

---

## 5. CONSTRUCTION ORDER (15c+)

Per the migration cadence — **one migration per cycle**, 0039 → 0040 → 0041:

1. Author drizzle schema entry (hand-named FKs per §3).
2. `pnpm run db:generate`.
3. Inspect generated SQL + `pnpm run db:check:migration-identifiers` (the >64-char guard).
4. Sandbox apply (env override → `jonnyrosero_pm_sandbox`).
5. `-E` contract-verify (information_schema) + FK matrix against §3.
6. **HALT for prod confirm.**
7. Prod apply.
8. `-E` contract-verify on prod.
9. Commit the 4-file unit (schema + migration SQL + journal + snapshot).

Repeat for 0040, then 0041. Then:

- **Engine** (`src/server/snow/`): event-fire generator (manual trigger entrypoint, the
  `run-due-schedules` analog but event-driven) → per-site spawn (`createJob` source
  `snow_event`) → skip-and-flag (IF-4) → batch-run header + per-site outcome records →
  auto-vs-stage path (the `approve`/auto branch analog).
- **Harness**: `scripts/check-snow-dispatch.ts` (the `check-pm-generation` analog —
  declare event over Acme's 4 sandbox sites, assert fan-out + skip-and-flag + counts).
- **Closeout**: 15p (11 standard docs + carry-forwards).

---

## 6. FORWARD-BANK (Phase 15)

New Phase-15 bank entries (opened 15b):

- **B-15.1** — snow service-log capture **RUNTIME** (schema lands 0041; mobile/execution
  capture defers — CF-14.1 analog).
- **B-15.2** — live weather feed + auto-event-trigger (manual fire built; weather eval +
  `snow_weather_observations` reads defer — B-14.2 analog).
- **B-15.3** — mass-op operator UI surfaces (engine is Phase 15; UI defers to
  operator-portal — B-14.4 analog).
- **B-15.4** — snow dashboard read surface (roadmap deliverable — thin read; confirm scope
  at 15c).

**Inherited still-open set carries forward UNCHANGED:** CF-13.x, CF-12.x, FB-10x,
CF-11.x (no Phase-15 work resolves or modifies these).
