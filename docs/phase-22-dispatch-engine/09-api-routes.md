# Phase 22 — API Routes / Server Actions

**No new HTTP routes.** Phase 22 is server functions + operator actions on the existing client-location page. Everything runs inside the `(app)` operator shell (`requireTenant`); nothing is public.

## Extended matcher (`src/server/vendor-matching.ts`)

| Function | Change |
|---|---|
| `findCandidateVendorsForJobByFacets(facets)` | **Additive.** +blocklist `NOT EXISTS` floor predicate; +`preferenceRank` SELECT subquery; +two leading ORDER BY keys. Existing trade/geo/compliance predicates + the existing tiebreak are **byte-identical**. |
| `findCandidateVendorsForJob(tenantId, jobId)` | **Public signature unchanged.** Now threads `job.clientId` + `job.clientLocationId` into the facets. |

- `MatchFacets` gains `clientId: string` + `clientLocationId: string`.
- `VendorCandidate` gains `preferenceRank: number | null` (null = not preferred). Both callers (`createDispatch` re-validation, the manual dispatch UI) are additive-safe.

## Routing read/write (`src/server/dispatch-routing.ts`, server-only)

| Function | Behavior | Throws |
|---|---|---|
| `createLocationPreferredVendor({tenantId, clientLocationId, tradeId, vendorId, priority, notes?, createdByUserId})` | guards (location/vendor/trade); tx + `FOR UPDATE` the unique tuple → **no-row insert / archived reactivate / active duplicate** (D-22.4); created/reactivated audit | `LOCATION_NOT_FOUND`, `VENDOR_NOT_FOUND`, `TRADE_NOT_FOUND`, `DUPLICATE_PREFERRED_VENDOR` |
| `archiveLocationPreferredVendor({tenantId, id, actorUserId})` | tx → `status='archived'` (idempotent no-op if already) + in-tx audit | `PREFERRED_VENDOR_NOT_FOUND` |
| `listLocationPreferredVendors(tenantId, clientLocationId)` | non-archived, joined to vendors+trades, `ORDER BY priority ASC, created_at` | — |
| `createLocationBlockedVendor({tenantId, clientId, clientLocationId, vendorId, reason?, createdByUserId})` | guards (location + `clientId` matches location's client; vendor); active-dedupe; insert + audit (no trade) | `LOCATION_NOT_FOUND`, `CLIENT_MISMATCH`, `VENDOR_NOT_FOUND`, `DUPLICATE_BLOCKED_VENDOR` |
| `archiveLocationBlockedVendor({tenantId, id, actorUserId})` | tx → `status='archived'` (idempotent) + in-tx audit | `BLOCKED_VENDOR_NOT_FOUND` |
| `listLocationBlockedVendors(tenantId, clientLocationId)` | this-location non-archived rows, joined to vendors + the barring user (who/when) | — |

## Auto-picker (`src/server/auto-dispatch.ts`, server-only)

| Function | Behavior |
|---|---|
| `autoDispatchDraftForJob(tenantId, jobId): Promise<AutoDispatchResult>` | idempotency guard (non-terminal assignment exists → `already_active`) → matcher (empty → `no_candidates`) → `candidates[0]` → `createDispatch({…, createdByUserId:null})` (always-DRAFT) → `auto_drafted` audit → `drafted`. `VENDOR_NO_LONGER_CANDIDATE` race → `no_candidates`. **Never calls `sendDispatch`.** |

```ts
type AutoDispatchResult =
  | { outcome: "drafted"; assignmentId: string; vendorId: string; preferenceRank: number | null }
  | { outcome: "no_candidates" }
  | { outcome: "already_active"; existingAssignmentId?: string };
```

> **`autoDispatchDraftForJob` has NO trigger / auto-invocation.** Nothing in the app calls it — no route, action, or cron. It is a mechanism for the harness and the **Phase-23** policy engine to invoke explicitly. (D-22.9.)

## `createDispatch` (`src/server/dispatch.ts`) — one-line type widen

`CreateDispatchInput.createdByUserId`: `string` → `string | null` (for the NULL system actor). No write-logic change; the three write targets were already nullable. Not a migration.

## Operator actions (`src/app/(app)/clients/dispatch-routing-actions.ts`, `"use server"`)

`addPreferredVendorAction` / `removePreferredVendorAction` / `addBlockedVendorAction` / `removeBlockedVendorAction` — each `requireTenant()` → passes `tenantId: ctx.activeTenant.tenantId` + `createdByUserId`/`actorUserId: ctx.user.id`; validates FormData; maps named errors + `ER_DUP_ENTRY`/1062 to `{error}`; `revalidatePath('/clients/<clientId>/locations/<locationId>')`. IDs bound in the page (`action.bind(null, clientId, locationId)`).

## UI

`src/app/(app)/clients/[id]/locations/[locationId]/page.tsx` gains two sections (Preferred vendors, Blocked vendors) — list + add-form card + remove/unblock, mirroring the existing contacts section. Form components `src/components/preferred-vendor-form.tsx` + `blocked-vendor-form.tsx` (client, `useActionState`). Vendor/trade selects reuse `listVendors` / `listActiveTrades` (the coverage-page helpers).

## Harness alias (package.json)

| Script | Command |
|---|---|
| `db:check:dispatch` | `tsx --env-file=.env.local --conditions=react-server scripts/check-phase-22.ts` |

## Env

**None new.** The auto-picker neither sends nor stores, so it touches neither the send (`RESEND_*`) nor storage (`R2_*`) seam; `APP_URL` is unaffected.
