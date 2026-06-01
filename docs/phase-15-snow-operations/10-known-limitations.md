# Phase 15 — Known Limitations

## Scope caps (deliberate — banked as carry-forwards)

- **No live weather feed / auto-trigger.** Events are declared **manually**. `snow_service_triggers` (`trigger_type` default `'manual'`; `'weather_threshold'` is a future value) and `snow_weather_observations` are schema room — no runtime reads or evaluates them this phase. (**B-15.2**)
- **No service-log capture runtime.** `snow_service_logs` schema lands (0041) — `serviced_at`, `photo_refs`, `gps_lat/lng`, `notes` — but no engine or surface fills it; the field/mobile capture flow is deferred (the CF-14.1 analog). (**B-15.1**)
- **No operator UI.** Engine + data layer only. Snow program CRUD, the declare/confirm surface, and mass-op screens defer to the operator-portal phase. Programs/sites are harness-seeded; there is no create/edit surface. (**B-15.3**)
- **No snow dashboard read surface.** A roadmap deliverable; a thin read over events/dispatches defers. (**B-15.4**)
- **No HTTP/action layer + no authz wrapper.** The three server fns are callable directly but have no `requireTenant`/`requireRole` action wrapper yet (the CF-14.2 analog). (rolls into B-15.3)

## Design notes / quirks

- **No count columns on `snow_events`.** Batch totals (`spawnedCount`/`skippedCount`) live in the `snow_event.dispatched` audit metadata, not on the header row. If a read surface needs them as queryable columns, add `spawned_count`/`skipped_count` later. (**CF-15.1**)
- **No recurrence.** A snow event fires once — there is intentionally no `next_due_at` advance (the one place Snow is simpler than PM). A "second wave" of the same storm is a new declared event.
- **Materialize-at-declare freezes membership.** A site enrolled (or deactivated) after an event is declared does NOT affect that event. Re-declaring picks up the current membership.

## Process notes (honest)

- **The identifier guard is NOT a pnpm alias.** `pnpm run db:check:migration-identifiers` does not exist — it runs inside `db:generate` and can be invoked directly as `node scripts/check-migration-identifiers.mjs`. (Documented in 04-admin-sop.)
- **Declaration-ordering necessity for the weather FK.** Because drizzle evaluates the `foreignKey()` callback eagerly at module load (parent-before-child convention), `snow_weather_observations` had to be **declared before** `snow_events` in `snow.ts` — even though it is a 0041 table — so `fk_sevent_weather` could reference it without a forward-const TDZ error. The migration itself is still additive 0041 (CREATE then ALTER); this is purely TS declaration order, noted in a schema comment.
- **`photo_refs` is `longtext` on MariaDB** (json → longtext + json_valid). Parse at the read boundary (the repo's MariaDB-JSON idiom).
- **`pnpm`, not npm** (inherited standing note).

## Inherited still-open

The full inherited carry-forward set (CF-13.x, CF-12.x, FB-10x, CF-11.x) rolls forward unchanged — see `closeout-carryforwards.md`.
