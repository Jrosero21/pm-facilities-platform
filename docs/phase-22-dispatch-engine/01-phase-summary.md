# Phase 22 — Phase Summary

**Phase:** 22 — Dispatch Engine: Eligibility + Deterministic Routing + Rule-Based Auto-Dispatch (Tiers 1–2) (v2.5.0-phase-22).
**Branch:** `phase-22-dispatch-engine` (off `main@76c5252`, the Phase-21 CF-21.1 roadmap-fix close).
**Outcome:** the **non-AI dispatch foundation** — where the safe volume is. A per-location **preferred-vendor** model (net-new, ranked) and a per-location **blocklist** (net-new), both wired into the **existing** Phase-5 eligibility floor so dispatch candidate lists are **floor-filtered then preferred-first**; plus a **rule-based auto-dispatch** mechanism that drafts the top eligible vendor and **stops at DRAFT (never sends)**. A **30-assertion** phase-blocking harness is green. On the **fourth v2 migration** (0045, additive).

## What Phase 22 is

The Phase-17a sweep + the 22a inspection confirmed a substantial dispatch foundation already exists from **Phase 5**: `findCandidateVendorsForJobByFacets` already filters candidates by **trade + geographic coverage + compliance** and ranks them (primary-trade → tightest-geo → name). Phase 22 therefore **ADDS to that floor — it does not rebuild it**. The net-new work is: a preferred-vendor concept, a per-location blocklist as a first-class floor signal, and a deterministic auto-picker over the (now-extended) candidate set.

- **Two net-new tables** (`src/server/schema/dispatch-routing.ts`, migration 0045): `location_preferred_vendors` (per-location × trade × vendor, ranked `priority`) and `location_blocked_vendors` (a **company** exclusion — no trade — scoped per-location or client-wide via a nullable `client_location_id`).
- **Matcher extension** (`src/server/vendor-matching.ts`, additive): a 4th `NOT EXISTS` floor predicate (blocklist — **exclusion-before-preference**) + a `preferenceRank` subquery that becomes a **leading ORDER BY key**. The existing trade/geo/compliance predicates and the existing tiebreak are **byte-identical**.
- **Read/write + a basic operator surface** (`dispatch-routing.ts` server fns + `dispatch-routing-actions.ts` + two location-page sections): create/archive/list for both tables; preferred create is **reactivate-on-readd**; blocklist accumulates archived history. Location-scoped authoring only.
- **Rule-based auto-picker** (`src/server/auto-dispatch.ts`): `autoDispatchDraftForJob` — take the **top candidate** of the floor-filtered, preference-then-rank-ordered set (no AI, no scoring), guard idempotency, **create a DRAFT** via the reused `createDispatch`, and write a legibility audit. It is a **callable mechanism with no trigger** — nothing auto-invokes it; **Phase 23 governs WHEN it runs** and whether a draft may auto-advance.

## Schema posture — ONE migration (0045), additive

Two `CREATE TABLE`s, no `ALTER` on any existing table. `location_preferred_vendors` (UNIQUE on `(client_location_id, trade_id, vendor_id)`, ranked `priority`) + `location_blocked_vendors` (no trade column, nullable `client_location_id`). Table count **118** (was 116); ledger **0045** (sandbox + prod). See `08-db-changes.md`.

## Built on

- **Phase 5** — the eligibility floor (`findCandidateVendorsForJobByFacets`) Phase 22 extends, and `createDispatch` (always-DRAFT, internal facet snapshot + `VENDOR_NO_LONGER_CANDIDATE` re-validation) the auto-picker reuses.
- **The dispatch status vocabulary** (`dispatch_assignment_statuses`, `is_terminal`) — DRAFT is the natural initial state; the auto-picker inherits "create-in-DRAFT, never send" for free, and the idempotency guard keys on `is_terminal`.

## The build (5 commits)

`1eb0e97` migration 0045 (two tables) · `71b374d` matcher extension (blocklist floor + preference ordering) · `3a097d4` preferred/blocklist read/write + location surface (incl. reactivate-on-readd) · `530860c` rule-based auto-dispatch picker (create-in-DRAFT) · `a83d31b` the 30-assertion harness. (The closeout-docs commit is the 6th unit, landing at the close gate.)

## Verification

`pnpm run db:check:dispatch` — **30/0 GREEN from committed state** (`a83d31b`), repeatable, clean teardown (12 groups: eligibility floor trade/geo/compliance/blocklist · preference ordering · blocklist-beats-preference · cross-tenant · auto-picker draft-gate · idempotency · auto_drafted audit · no-candidates · write-boundary). Pure DB — **no** capture flags. `pnpm exec tsc --noEmit` → 0.

## Disposition note

Phase 22 is a **pure build phase — it retires NOTHING** from the inherited carry-forward bank. The §9 operator-portal-UI bucket (`B-14.1/14.3/14.4/B-15.3/CF-14.3`, "Phases 18/22/28 as the surfaces land") is **unfulfilled for the 22-portion** — Phase 22 built dispatch routing, not the PM/snow/mass-op operator UIs those items name; they **roll forward OPEN**. The §9 wording is conditional ("as the surfaces land"), so — unlike CF-19.4 / CF-20.3 / CF-21.1 — **no doc-correction CF is needed**. (CF-21.1 itself is now **discharged** @ `76c5252`; **B-16.3 stays OPEN**.) See `11-closeout.md` / `closeout-carryforwards.md`.
