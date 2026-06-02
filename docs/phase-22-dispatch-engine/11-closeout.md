# Phase 22 — Closeout

## Goal

Build the **non-AI dispatch foundation** (Tiers 1–2): a shared eligibility floor (the candidate-set both rule-based and future AI pickers consume) extended with a net-new **per-location preferred-vendor** model (ranked) and a net-new **per-location blocklist** (a first-class floor signal); and a **rule-based auto-dispatch** that picks the best eligible vendor by rule and **drafts** it (never sends) — designed to be **gate-able** so the Phase-23 policy engine can govern it. ADD to the existing Phase-5 floor; do not rebuild it. On the fourth v2 migration (0045, additive).

## Completed deliverables

- **Shared eligibility floor (extended).** `findCandidateVendorsForJobByFacets` now filters on trade + geographic coverage + compliance (Phase-5, byte-identical) **plus** a net-new **blocklist `NOT EXISTS`** (exclusion-before-preference), and orders **preferred-first** then the existing tiebreak. The compliance check lives in the dispatch path (fail-open-with-flag, TEMPORARY per D-5.2).
- **Deterministic routing — preferred-vendor-per-location.** Net-new `location_preferred_vendors` (per-location × trade × vendor, ranked `priority`); create is **reactivate-on-readd** (tx + `FOR UPDATE`, unique retained, no migration).
- **Per-location blocklist.** Net-new `location_blocked_vendors` — a **company** exclusion (no trade), scoped per-location or client-wide (nullable `client_location_id`), with who/when/reason audit.
- **Rule-based auto-dispatch.** `autoDispatchDraftForJob` — top-candidate rule (no AI), per-job non-terminal idempotency guard, **create-in-DRAFT** via the reused `createDispatch`, `auto_drafted` legibility audit, **stops at DRAFT**. No trigger wired (Phase 23 governs invocation).
- **Operator surface + read/write.** 6 routing fns + 4 operator actions + two basic location-page sections (list + add + remove/unblock); location-scoped authoring.
- **Migration 0045:** the two tables.
- A **30-assertion phase-blocking harness**, green from committed state.

## Files created / changed (commits `1eb0e97` · `71b374d` · `3a097d4` · `530860c` · `a83d31b`)

- `src/server/schema/dispatch-routing.ts` (two tables) + `src/server/schema/index.ts` (barrel) + `db/migrations/0045_broken_hulk.sql` — migration unit (`1eb0e97`).
- `src/server/vendor-matching.ts` — additive blocklist floor + preference ordering; `MatchFacets`/`VendorCandidate` extended (`71b374d`).
- `src/server/dispatch-routing.ts` (6 fns, reactivate-on-readd) + `src/app/(app)/clients/dispatch-routing-actions.ts` + `src/components/{preferred,blocked}-vendor-form.tsx` + the location detail page (`3a097d4`).
- `src/server/auto-dispatch.ts` (`autoDispatchDraftForJob`) + `src/server/dispatch.ts` (`createdByUserId` widened `string|null`) (`530860c`).
- `scripts/check-phase-22.ts` + `package.json` alias `db:check:dispatch` — harness (`a83d31b`).
- `docs/phase-22-dispatch-engine/` — this closeout set (the 6th unit, this commit).

## DB changes

**ONE migration (0045), additive.** Two new tables (`location_preferred_vendors`, `location_blocked_vendors`); no `ALTER`, no drops. Table count **118**; ledger **0045** (sandbox + prod). Plus a non-migration type widen (`createDispatch.createdByUserId` → `string|null`). See `08-db-changes.md`.

## API routes / server actions added

**No new HTTP routes.** The extended matcher (`preferenceRank`, `+clientId/+clientLocationId` facets); the 6 routing fns; `autoDispatchDraftForJob` (+ the `AutoDispatchResult` union, **no trigger**); 4 operator actions on the location page. See `09-api-routes.md`.

## User-facing workflows added

Operator: set ranked preferred vendors per location+trade; bar (block) a vendor at a location with a reason; unblock / un-prefer (soft-delete). The manual dispatch candidate list now shows preferred-first and excludes blocked vendors. See `03-user-sop.md`, `05-system-workflows.md`.

## Admin/internal workflows added

The eligibility floor's operational behavior; the auto-picker exists but is **not** auto-invoked (Phase 23 governs); the `db:check:dispatch` harness (sandbox-only, pure DB). **No new env.** See `04-admin-sop.md`.

## Business rules added

R-22.1…R-22.12, each mapped to a harness group. Phase 22 binds **invariant 5** (hard eligibility floor, blocklist exclusion-before-preference), **invariant 4** (gate-ability — DRAFT never SENT), **invariant 6** (idempotency), **invariant 2** (auto_drafted never-silent), **invariant 7** (manage-by-exception). It is **not** the policy engine (Phase 23). See `06-business-rules.md`.

## Chatbot knowledge added

`07-chatbot-knowledge.md` — operators set per-location preferred vendors (ranked) and block vendors per-location; candidate lists are floor-filtered + preferred-first; a rule-based auto-dispatch mechanism drafts (never sends) and nothing auto-invokes it yet (Phase 23 governs).

## Verification

```
pnpm run db:check:dispatch
→ passed: 30 / failed: 0  — PHASE-22 DISPATCH-ENGINE LEDGER GREEN ✓   (green from committed state a83d31b; repeatable; teardown clean)
```
Groups: floor trade/geo/compliance/blocklist · preference ordering · blocklist-beats-preference (exclusion wins) · cross-tenant isolation · auto-picker draft-gate (DRAFT never SENT) · idempotency (one assignment) · auto_drafted audit (NULL system actor) · no-candidates (creates nothing) · write-boundary (facet snapshot). Pure DB — **no** capture flags. `pnpm exec tsc --noEmit` → 0. (Two harness-only bugs were found and fixed during the run — a MariaDB-JSON parse-at-read on the audit metadata, and a teardown leak where `FK_CHECKS=0` skipped the tenant-B child cascade — both in the test harness, never the product.)

## Known limitations

Geo equality-only (radius/county inert; CF-22.1); no client-level default preferred vendor (CF-22.2); client-wide-ban authoring UI + management-screen polish deferred (CF-22.3); the auto-picker has no trigger and never sends — **by design** (gate-ability; Phase 23 governs invocation + send), not a gap; compliance floor fail-open-with-flag is TEMPORARY (tightens when data lands, no schema change). See `10-known-limitations.md`.

## Carry-forward items

**Retired this phase: NOTHING.** Phase 22 is a pure build phase — no inherited carry-forward item is discharged. New items: **CF-22.1** (rich service-area coverage model — geocoding/distance, polygon, map-draw, service-history), **CF-22.2** (client-level default preferred vendor), **CF-22.3** (client-wide-ban authoring UI + preferred/blocklist management-screen polish). The §9 operator-portal-UI bucket (`B-14.1/14.3/14.4/B-15.3/CF-14.3`, "Phases 18/22/28 as the surfaces land") is **unfulfilled for the 22-portion** and rolls forward OPEN; its wording is conditional, so **no doc-correction CF is needed** (unlike CF-19.4/20.3/21.1). **CF-21.1 is now DISCHARGED** (the roadmap §6/§9 B-16.3 correction landed at `76c5252`, the branch point; verified in the live roadmap) — **B-16.3 itself stays OPEN**. See `closeout-carryforwards.md`.

## Recommended next phase focus

**Phase 23 — Autonomy Policy Engine (per-agent on/off MVP) + Guardrail Layer** (roadmap v2.6.0): the governance for the mechanism Phase 22 just built — per-tenant/per-agent autonomy enablement (fail-safe default off), the dispatch-tier policy, the non-overridable guardrail layer (spend breaker + kill switch), and the invocation/auto-send enablement that decides **when** `autoDispatchDraftForJob` runs and whether a DRAFT may advance. (Roadmap notes 22/23 are tightly coupled — 22 built the mechanism, 23 governs it.)
