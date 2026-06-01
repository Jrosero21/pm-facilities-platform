# Phase 15 — DB Changes

8 tables across migrations **0039 / 0040 / 0041**, sandbox + prod applied + contract-verified. Prod base tables 107 → **115**. All PKs `varchar(36)` uuidv7. **25 snow FKs** (16 CASCADE / 4 RESTRICT / 5 SET NULL), all hand-named (WP-12.2).

## Migration 0039 — program + site layer (`0039_tearful_princess_powerful.sql`)

**`snow_programs`** (12 cols) — `id`, `tenant_id`, `client_id`, `name`, `default_problem_description` (text, NOT NULL — `createJob` requires it), `default_primary_trade_id`, `default_priority_id`, `auto_dispatch` (bool, default **false**), `is_active` (bool, default true), `created_by_user_id`, `created_at`, `updated_at`.

**`snow_sites`** (9 cols) — overlay on `client_locations`: `id`, `tenant_id`, `snow_program_id`, `client_location_id`, `plow_priority` (int), `site_notes` (text), `is_active` (bool, default true), `created_at`, `updated_at`.

**`snow_service_triggers`** (10 cols) — `id`, `tenant_id`, `snow_program_id`, `name`, `trigger_type` (varchar(32), default `'manual'`), `threshold_value` (decimal(6,2), placeholder), `threshold_unit` (varchar(16), placeholder), `is_active`, `created_at`, `updated_at`.

## Migration 0040 — event + fan-out layer (`0040_gray_power_man.sql`)

**`snow_events`** (10 cols) — `id`, `tenant_id`, `snow_program_id`, `name`, `event_status` (enum, default `'declared'`), `declared_at` (timestamp), `declared_by_user_id`, `snow_weather_observation_id` (soft in 0040; FK added 0041), `created_at`, `updated_at`.

**`snow_event_sites`** (6 cols) — `id`, `tenant_id`, `snow_event_id`, `snow_site_id`, `created_at`, `updated_at`.

**`snow_dispatches`** (9 cols) — `id`, `tenant_id`, `snow_event_site_id`, `job_id` (nullable until spawned), `dispatch_status` (enum, default `'staged'`), `skip_reason` (text), `spawned_at` (timestamp), `created_at`, `updated_at`.

## Migration 0041 — capture + weather placeholder (`0041_charming_william_stryker.sql`)

**`snow_service_logs`** (11 cols) — `id`, `tenant_id`, `snow_dispatch_id`, `serviced_at` (timestamp, nullable), `photo_refs` (**json → `longtext`** on MariaDB; parse at read), `gps_lat` (decimal(10,7)), `gps_lng` (decimal(10,7)), `notes` (text), `logged_by_user_id`, `created_at`, `updated_at`.

**`snow_weather_observations`** (10 cols) — `id`, `tenant_id`, `snow_program_id` (nullable), `observed_at` (timestamp), `source` (varchar(64), default `'manual'`), `snow_depth` (decimal(6,2)), `temperature` (decimal(6,2)), `notes` (text), `created_at`, `updated_at`.

**+ `fk_sevent_weather`** — the only ALTER of an existing table: `ALTER TABLE snow_events ADD CONSTRAINT fk_sevent_weather FOREIGN KEY (snow_weather_observation_id) REFERENCES snow_weather_observations(id) ON DELETE SET NULL` (completes the 0040 soft ref; provably safe on the empty `snow_events`).

## Enums

| Column | Enum | Default |
|---|---|---|
| `snow_events.event_status` | `declared`, `dispatching`, `complete`, `cancelled` | `declared` |
| `snow_dispatches.dispatch_status` | `staged`, `spawned`, `skipped`, `cancelled` | `staged` |

`trigger_type` and `source` are `varchar` rule-shapes (default `'manual'`), not enums — future values land without a schema change.

## FK matrix (25 — all hand-named)

| Constraint | Table | → References | DELETE |
|---|---|---|---|
| fk_sprog_tenant | snow_programs | tenants | CASCADE |
| fk_sprog_client | snow_programs | clients | RESTRICT |
| fk_sprog_trade | snow_programs | trades | RESTRICT |
| fk_sprog_priority | snow_programs | priorities | RESTRICT |
| fk_sprog_created_by | snow_programs | users | SET NULL |
| fk_ssite_tenant | snow_sites | tenants | CASCADE |
| fk_ssite_program | snow_sites | snow_programs | CASCADE |
| fk_ssite_location | snow_sites | client_locations | RESTRICT |
| fk_strig_tenant | snow_service_triggers | tenants | CASCADE |
| fk_strig_program | snow_service_triggers | snow_programs | CASCADE |
| fk_sevent_tenant | snow_events | tenants | CASCADE |
| fk_sevent_program | snow_events | snow_programs | CASCADE |
| fk_sevent_declared_by | snow_events | users | SET NULL |
| fk_sevent_weather | snow_events | snow_weather_observations | SET NULL |
| fk_ses_tenant | snow_event_sites | tenants | CASCADE |
| fk_ses_event | snow_event_sites | snow_events | CASCADE |
| fk_ses_site | snow_event_sites | snow_sites | CASCADE |
| fk_disp_tenant | snow_dispatches | tenants | CASCADE |
| fk_disp_event_site | snow_dispatches | snow_event_sites | CASCADE |
| fk_disp_job | snow_dispatches | jobs | SET NULL |
| fk_slog_tenant | snow_service_logs | tenants | CASCADE |
| fk_slog_dispatch | snow_service_logs | snow_dispatches | CASCADE |
| fk_slog_logged_by | snow_service_logs | users | SET NULL |
| fk_swobs_tenant | snow_weather_observations | tenants | CASCADE |
| fk_swobs_program | snow_weather_observations | snow_programs | CASCADE |

**Delete-rule rationale:** `tenant_id` → CASCADE everywhere (a snow row has no value without its tenant). Parent membership/outcome refs (program→site/trigger/event/observation; event→event_site; event_site→dispatch→service_log) → CASCADE. Ref-data (`client`/`trade`/`priority`/`client_location`) → RESTRICT (never vanish under a live program; never let an enrollment block-delete a real location). Soft refs that should survive their target (`created_by`, `declared_by`, `job_id`, `logged_by`, `weather_observation`) → SET NULL.
