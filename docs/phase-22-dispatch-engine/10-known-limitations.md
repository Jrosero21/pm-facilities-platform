# Phase 22 — Known Limitations

## Functional boundaries (by design / locked decisions)

- **Geographic matching is equality-only; radius/county areas are inert.** The floor matches a vendor's service area to the job location by **equality** — national / state / city+state / postal_code. `radius` and `county` `vendor_service_areas` rows are **stored but never evaluated** (there are no `client_locations` lat/long to measure against, and no county compare). A richer model — client-location geocoding + a distance predicate (to activate radius), polygon coverage, manual map-drawing, prior-service-history — is a known-hard problem with no single graceful representation and is deferred. → banked as **CF-22.1** (relates the 17a geo gap). Geo is a clean hard filter (it matches or it doesn't); unlike compliance it gets no flagged-draft treatment.

- **No client-level default preferred vendor.** `location_preferred_vendors` is **per-location-per-trade** (the shipped grain). A client-level default (one row covering all a client's locations for a trade) is **not** supported — it needs precedence-resolution logic (a location-specific row overriding a client default), beyond the leading sort key shipped. → banked as **CF-22.2**.

- **Client-wide-ban authoring UI is deferred.** The matcher **honors** a client-wide block (`location_blocked_vendors` with `client_location_id IS NULL`), but the operator surface only **authors location-scoped** blocks this phase. Authoring a client-wide ban (and polishing the basic list+add+remove sections into a fuller management screen) is deferred. → banked as **CF-22.3**.

- **The auto-picker has no trigger and never sends — BY DESIGN, not a gap.** `autoDispatchDraftForJob` is a callable mechanism that creates a **DRAFT** and stops; **nothing auto-invokes it**, and it cannot auto-send. This is **gate-ability** (invariant 4/5 prep): Phase 22 builds the dispatch mechanism, and **Phase 23** (the autonomy policy engine + guardrails) governs **when** it runs and whether a draft may auto-advance to SENT. It is "mechanism built; governance is Phase 23," not an unfinished feature.

- **Compliance floor is fail-open-with-flag — TEMPORARY.** With `vendor_compliance` empty (17a), an absent compliance row is treated as `no_data` = **eligible-but-recorded** (snapshotted on the assignment as `compliance_status_at_dispatch`), so the engine functions on the data that exists (trade + geo + blocklist). This is explicitly temporary (Phase-5 D-5.2): when real compliance data lands, the exclude predicate tightens to "compliant required" with **no schema change**.

## Data dependency (inherited, still open)

- **`vendor_compliance` / `vendor_rates` / `vendor_performance_scores` are empty** (17a). This is why the compliance floor is fail-open today, and why **Tier-3 AI dispatch (Phase 27) is data-blocked** — there are no performance scores or rates to score against. Phase 22 deliberately builds only the deterministic Tiers 1–2 over the data that exists.

## Cross-cutting / disposition

- **Phase 22 retires NOTHING.** It is a pure build phase; no inherited carry-forward item is discharged. See `11-closeout.md` / `closeout-carryforwards.md`.

- **The §9 operator-portal-UI bucket is unfulfilled for the 22-portion (no correction needed).** Roadmap §9 lists `B-14.1/14.3/14.4/B-15.3/CF-14.3` as "Retired by v2 phases … (Phases 18/22/28 **as the surfaces land**)." Phase 22 built dispatch routing + a small per-location preferred/blocklist surface — **not** the PM/snow/mass-op operator UIs those items name. They **roll forward OPEN**. Because §9's wording is **conditional** ("as the surfaces land"), this is **not** a false flat retirement claim like CF-19.4 / CF-20.3 / CF-21.1 were, so **no doc-correction CF is opened**; the standing §6/§9 over-attribution watchpoint carries forward.

## Inherited / standing

Standard watchpoints (pnpm not npm; MariaDB JSON parse-at-read — hit and handled in the harness; SSH tunnel for DB scripts; sandbox→prod migration cadence; confirm the resolved DB name before any prod DDL; pre-name FKs >64 chars; drizzle forward-FK ordering) carry forward unchanged.
