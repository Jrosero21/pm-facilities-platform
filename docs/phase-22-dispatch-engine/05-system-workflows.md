# Phase 22 — System Workflows

## Workflow 22.A — The eligibility floor + preference ordering (the extended matcher)

```
findCandidateVendorsForJob(tenantId, jobId)            [public sig unchanged]
        │   getJob → primaryTradeId, clientId, clientLocationId   (no trade ⇒ [])
        │   getLocation → city/state/postal                       (missing ⇒ [])
        │
findCandidateVendorsForJobByFacets({tenantId, clientId, clientLocationId, tradeId, city, state, postal})
        │   SELECT vendors WHERE vendors.tenant_id = tenantId AND vendors.status='active'
        │     AND  EXISTS  vendor_trade_coverage (trade match)            ── floor, unchanged
        │     AND  EXISTS  vendor_service_areas  (geo equality match)     ── floor, unchanged
        │     AND  NOT EXISTS vendor_compliance status IN (expired,       ── floor, unchanged (D-5.2)
        │                                            non_compliant)
        │     AND  NOT EXISTS location_blocked_vendors                    ── NEW floor (exclusion)
        │              b.vendor_id = vendor AND b.status='active'
        │              AND b.client_id = clientId
        │              AND (b.client_location_id IS NULL                  ── client-wide ban
        │                   OR b.client_location_id = clientLocationId)   ── this-location ban
        │     SELECT … preferenceRank =                                   ── NEW (ordering only)
        │       COALESCE((SELECT MIN(priority) FROM location_preferred_vendors
        │                 WHERE vendor + tenant + clientLocationId + tradeId, active), NULL)
        │   ORDER BY (preferenceRank IS NULL) ASC, preferenceRank ASC,    ── NEW leading keys
        │            primaryTradeMatch DESC, tightestGeoRank ASC, name ASC ── existing tiebreak
```
A blocklisted vendor never enters the result set (exclusion-before-preference). Preference only **sorts** survivors — it never filters. The trade/geo/compliance predicates and the existing tiebreak are byte-identical to Phase 5.

## Workflow 22.B — Rule-based auto-dispatch (idempotency → match → DRAFT → audit → STOP)

```
autoDispatchDraftForJob(tenantId, jobId)               [callable; NO trigger invokes it]
        │
        │   ── a. IDEMPOTENCY GUARD (first; cheap short-circuit) ───────────────
        │   EXISTS job_vendor_assignments ⨝ dispatch_assignment_statuses
        │          WHERE tenant + job AND is_terminal = false
        │      → return { outcome:"already_active", existingAssignmentId }
        │
        │   ── b. MATCH ────────────────────────────────────────────────────────
        │   candidates = findCandidateVendorsForJob(tenantId, jobId)   (extended matcher)
        │   if candidates.length === 0 → return { outcome:"no_candidates" }   (create NOTHING)
        │
        │   ── c. RULE = top candidate; CREATE-IN-DRAFT (reused createDispatch) ─
        │   top = candidates[0]
        │   createDispatch({ tenantId, jobId, vendorId: top.vendorId, createdByUserId: null })
        │        // always DRAFT (status hardcoded) · snapshots facets server-side
        │        // re-validates VENDOR_NO_LONGER_CANDIDATE · writes null→DRAFT history (NULL actor)
        │        // NEVER calls sendDispatch
        │   catch VENDOR_NO_LONGER_CANDIDATE → return { outcome:"no_candidates" }   (narrow race)
        │
        │   ── d. LEGIBILITY AUDIT (invariant 2) ────────────────────────────────
        │   writeAuditLog { userId:null, action:"job_vendor_assignment.auto_drafted",
        │                   targetId: assignmentId, metadata:{ jobId, vendorId,
        │                   rule:"preferred-then-rank", preferenceRank: top.preferenceRank } }
        │
        └── return { outcome:"drafted", assignmentId, vendorId, preferenceRank }
```
It **stops at DRAFT**. Auto-send is structurally impossible here (sending is a separate `sendDispatch`); Phase 23 governs whether/when a DRAFT auto-advances. The guard grain is **per-job non-terminal** (DECLINED/WORK_COMPLETE/CANCELLED don't block a re-dispatch).

## Workflow 22.C — Preferred-vendor create (reactivate-on-readd)

```
createLocationPreferredVendor({ tenantId, clientLocationId, tradeId, vendorId, priority, createdByUserId })
        │   guards: getLocation / getVendor / getTrade  → *_NOT_FOUND
        │   tx:
        │     SELECT … FOR UPDATE the (clientLocationId, tradeId, vendorId) tuple  (ANY status)
        │     ├─ no row        → INSERT active + audit location_preferred_vendor.created
        │     ├─ archived row  → UPDATE status='active', refresh priority/notes/createdBy
        │     │                  + audit location_preferred_vendor.reactivated
        │     └─ active row     → throw DUPLICATE_PREFERRED_VENDOR
        │   (FOR UPDATE serializes concurrent re-adds; the retained UNIQUE backstops the
        │    brand-new-triple race → ER_DUP_ENTRY, mapped to a friendly error in the action)
```

## Workflow 22.D — Soft-delete (archive) for preferred / blocked

```
archiveLocationPreferredVendor / archiveLocationBlockedVendor({ tenantId, id, actorUserId })
        │   tx:
        │     SELECT … FOR UPDATE the row (tenant-scoped)   → *_NOT_FOUND if missing
        │     if status==='archived' → return                (idempotent no-op)
        │     UPDATE status='archived'
        │     INSERT audit  …_preferred_vendor.archived / …_blocked_vendor.archived
```
List reads (`listLocationPreferredVendors` / `listLocationBlockedVendors`) filter `ne(status,'archived')` and are location-scoped (the blocked list shows this location's rows, not the client-wide NULL rows).

## Workflow 22.E — Blocklist create (company exclusion, accumulate history)

```
createLocationBlockedVendor({ tenantId, clientId, clientLocationId, vendorId, reason, createdByUserId })
        │   guards: getLocation (+ clientId matches the location's client → CLIENT_MISMATCH); getVendor
        │   dedupe on an active (clientId, clientLocationId, vendorId) triple → DUPLICATE_BLOCKED_VENDOR
        │   INSERT active row (no trade column) + audit location_blocked_vendor.created
        │       (re-block after unblock just inserts a fresh active row; archived rows accumulate as history)
```
