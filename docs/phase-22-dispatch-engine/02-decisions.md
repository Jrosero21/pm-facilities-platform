# Phase 22 — Decisions

## D-22.1 — A dedicated `location_preferred_vendors` table (per-location × trade, ranked)

"This location's preferred vendor for this trade" is net-new — no preferred-vendor concept existed. Three shapes were considered: a dedicated table, a general `routing_rules` table, or a column on `client_locations`. Chosen: a **dedicated table**, `(client_location_id × trade_id × vendor_id)` with an integer **`priority`** (lower = stronger; 1 = primary), `UNIQUE(client_location_id, trade_id, vendor_id)`.
- **Right granularity.** The real-world need (the "500 stores in the radius → this vendor" case) is per-location-per-trade; a column on `client_locations` can't express per-trade or a ranked fallback, and a general rules table over-engineers Tier 1–2 (it strays into Phase-23 policy territory).
- **Ranked, ties allowed.** `priority` orders the auto-picker's fallback; it is **not** uniquely constrained — two vendors may share a rank and the existing ranker (primary-trade → tightest-geo → name) breaks the tie. Enforcing unique priority would make re-ranking a shuffle.
- **Preference is an ORDERING, never a bypass.** The eligibility floor filters first; preference only **sorts survivors** (D-22.5). A preferred vendor who fails the floor is skipped — invariant 5 stays intact.

## D-22.2 — Compliance floor is fail-open-with-flag (+ draft-gate), not fail-closed

`vendor_compliance` is **empty** (17a, still open). Fail-closed (no row → ineligible) would make the engine dead on arrival; naive fail-open would hide that nobody verified compliance (violating "never silent"). Chosen — and **already half-built in the Phase-5 floor**: an absent compliance row resolves to **`no_data` = eligible-but-recorded** (snapshotted on the assignment as `compliance_status_at_dispatch`), and the auto-dispatch path stays at **DRAFT** (it never auto-sends). The floor that functions today is **trade + geo + not-blocklisted** as hard filters, **compliance present-but-degraded**. This is **TEMPORARY (Phase-5 D-5.2)**: when compliance data lands, the existing exclude predicate tightens to a hard gate with **no schema change** (it already keys on `compliance_status`).

## D-22.3 — Blocklist is a COMPANY exclusion (no trade), scoped per-location or client-wide, exclusion-before-preference

`location_blocked_vendors` bars a vendor regardless of the job's trade — **there is no `trade_id`** (trade-specific blocking is a confirmed non-need: "don't use this subcontractor here for anything"). Scope is **nullable-location**: `client_id` is the always-set anchor; `client_location_id` **NULL = a client-wide ban** (all the client's locations), set = this-location-only. It is wired into the matcher as a **`NOT EXISTS` floor predicate** alongside trade/geo/compliance, so **exclusion happens before preference ordering even looks at survivors** — a vendor that is both preferred **and** blocked is excluded entirely (the core safety rule, harness G6).

## D-22.4 — Preferred create is reactivate-on-readd (tx + `FOR UPDATE`, unique retained, no migration)

The `UNIQUE(client_location_id, trade_id, vendor_id)` spans **all** statuses, so a naive "active-dedupe then insert" would collide on an **archived** row when a previously-removed preference is re-added (a real workflow). Resolved **in app code, no second migration**: `createLocationPreferredVendor` runs a `tx` that `SELECT … FOR UPDATE`s the unique-key tuple at any status, then branches — **no row → insert** / **archived → reactivate in place** (refresh priority/notes/createdBy, audit `…reactivated`) / **active → `DUPLICATE_PREFERRED_VENDOR`**. The `FOR UPDATE` serializes concurrent re-adds; the **retained UNIQUE** backstops the brand-new-triple race (→ `ER_DUP_ENTRY`, caught in the action). Keeping the unique = keeping the race guarantee, with no migration. (The **block** table has no unique — re-block-after-unblock just inserts a fresh active row and accumulates archived history, the `client_nte_rules` soft-delete model.)

## D-22.5 — ADD to the Phase-5 floor; do not rebuild it

The matcher extension is **purely additive**: the existing trade `EXISTS`, geo equality predicate, compliance `NOT EXISTS`, and the `no_data` CASE are **byte-identical** to Phase 5; the existing ORDER BY tail (`primaryTradeMatch DESC, tightestGeoRank ASC, name ASC`) is unchanged. Only three things are added — a blocklist `NOT EXISTS` in the WHERE, a `preferenceRank` SELECT subquery, and **two prepended** ORDER BY keys (`(preferenceRank IS NULL) ASC, preferenceRank ASC`). `MatchFacets` gains `clientId`/`clientLocationId` (threaded from the job; the public `findCandidateVendorsForJob(tenantId, jobId)` signature is unchanged); `VendorCandidate` gains `preferenceRank: number | null`.

## D-22.6 — Auto-picker rule = `candidates[0]`, no AI

The deterministic rule is literally **the top candidate** of the floor-filtered, preference-then-rank-ordered matcher output. No scoring, no tiebreaker model. AI scoring (Tier 3) is **Phase 27** and is **data-blocked** (`vendor_performance_scores`/`vendor_rates` empty). An empty candidate set → `no_candidates` (creates nothing — invariant 7).

## D-22.7 — Create-in-DRAFT via the reused `createDispatch` (auto-send is structurally impossible)

`autoDispatchDraftForJob` does **not** duplicate the insert path — it calls the existing `createDispatch`, which **always lands at DRAFT** (status is hardcoded, not a parameter), snapshots the facets server-side, and runs its own `VENDOR_NO_LONGER_CANDIDATE` re-validation. Sending is a **separate** function (`sendDispatch`); the picker never calls it. So the auto-picker **cannot** auto-send — gate-ability (invariant 4/5 prep) is structural, not a flag. `CreateDispatchInput.createdByUserId` was widened `string → string | null` (a 1-line type change, not a migration) so the picker can write a **NULL system actor**; all three write targets were already nullable.

## D-22.8 — `auto_drafted` audit for legibility (NULL actor alone is ambiguous)

After `createDispatch` returns, the picker writes its **own** `job_vendor_assignment.auto_drafted` audit row (`userId: null`, metadata `{jobId, vendorId, rule:"preferred-then-rank", preferenceRank}`). A NULL actor by itself doesn't distinguish "system auto-dispatch" from other null-actor writes; the dedicated audit action makes the **autonomous** action explicit and spot-reviewable — **invariant 2 (autonomy never silent)**.

## D-22.9 — No trigger wired (Phase 23 governs invocation)

`autoDispatchDraftForJob` is a callable function with **no caller** — no cron, no action, no auto-invocation. **Phase 23** (the autonomy policy engine + guardrails) governs **WHEN** it runs and whether a DRAFT may auto-advance to SENT. This is **by design** (gate-ability), not an unfinished gap: Phase 22 builds the mechanism; Phase 23 builds the governance. (The roadmap sequences 22 before 23 precisely so there is something to govern.)

## D-22.10 — Location-scoped authoring only this phase

The operator surface authors **location-scoped** rows only (preferred = `{location, trade, vendor, priority}`; block = `{client, this-location, vendor, reason}`). A **client-level default preferred vendor** is deferred (CF-22.2 — it needs precedence resolution, a location row overriding a client default, beyond the leading sort key shipped). **Client-wide-ban authoring** (the NULL-`client_location_id` block row) is deferred (CF-22.3) — the matcher **honors** such rows, but their authoring UI is not built. Audit is **not** minimal: every write records `created_by_user_id` (who) + `created_at` (when), and a block records `reason`, threaded from the operator ctx.

## D-22.11 — Geo stays equality-only (radius/county inert)

Coverage matching is **equality-based** (national / state / city / postal_code), exactly as Phase 5 shipped. `radius` and `county` service-area rows are **stored but INERT** — the matcher never evaluates them (no `client_locations` lat/long, no county compare). A richer coverage model (geocoding + distance, polygon, map-draw, prior-service-history) is a known-hard model with no single graceful representation and is deferred (**CF-22.1**). Geo is a **clean** hard filter — it either matches or the vendor isn't geo-eligible; unlike compliance it gets **no** flagged-draft treatment.
