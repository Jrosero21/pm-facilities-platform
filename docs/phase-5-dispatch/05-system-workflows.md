# Phase 5 — System Workflows

How dispatch flows at runtime, and **why** each step is shaped the way it is. Mechanics-only descriptions live in `09-api-routes.md`; this file is about reasoning. Builds on the Phase 4 server-action → guard → mutate → audit shape and the `createJob` 7-step transaction; adds the first **cross-vendor matching query**, the first **dual-entity transaction**, and the first **job status transition**.

## WF-5.1 — Match candidate vendors for a job
```
findCandidateVendorsForJob(tenantId, jobId)
  → getJob(tenantId, jobId)              (need primary_trade_id + client_location_id)
  → if !primaryTradeId → []              (nothing to match against)
  → getLocation(tenantId, clientLocationId) → facets {tradeId, city, state, postal}
  → findCandidateVendorsForJobByFacets({tenantId, tradeId, city, state, postal})
       SELECT vendors WHERE tenant + active
         AND EXISTS (trade-eligible: vendor_trade_coverage active, branch-active)        -- D-5.3
         AND EXISTS (geo-eligible: vendor_service_areas active, branch-active, equality)  -- D-5.1
         AND NOT EXISTS (compliance: active expired/non_compliant row)                    -- D-5.2
       + per-row facets: primaryTradeMatch, tradeScope, geoMatchTypes, tightestGeoMatch, complianceStatus
       ORDER BY primaryTradeMatch DESC, tightestGeoRank ASC, name ASC                     -- D-5.4
```
**Why this shape:**
- *A new query, not an extension of `listVendorServiceAreas` (D-3.12):* matching is a different question (rank eligible vendors for a job) than listing one vendor's areas. It's purpose-built.
- *Trade ⟂ geo as independent vendor-level EXISTS (D-5.3):* coverage and service-area may be scoped to different branches; requiring them at the *same* branch would wrongly exclude vendor-wide-trade + branch-area combinations. Each predicate honors the branch-active rule (the contributing row is vendor-wide OR its parent `vendor_location` is active).
- *Equality geo, compliance non-blocking (D-5.1/D-5.2):* no coordinates → radius inert; no county column → county inert; zero compliance rows → absence is eligible (`no_data`), only explicit expired/non_compliant excludes. Both have documented sunset triggers.
- *Correlated-subquery gotchas:* outer refs inside SELECT-list `sql` fragments render unqualified (ambiguous) → forced with `sql.raw("\`vendors\`.\`id\`")`; computed columns get `.as()` so `ORDER BY` can name them. (Both documented in the `src/server/vendor-matching.ts` comments.)

## WF-5.2 — Create a dispatch (single-entity, 3-write transaction)
```
/jobs/[id]/dispatch/new (NewDispatchForm, client) → createDispatchAction(jobId, prev, formData)
  → requireTenant(); require vendorId
  → createDispatch({ tenantId, jobId, vendorId, vendorLocationId?, vendorContactId?,
                     agreedNteAmount?, scheduled*?, dispatchScope?, createdByUserId })

      -- read-only guards (BEFORE the txn) --
      getJob → JOB_NOT_FOUND;  if !primaryTradeId → JOB_NOT_DISPATCHABLE
      getVendor → VENDOR_NOT_FOUND
      if vendorLocationId: getVendorLocation + assert .vendorId === vendorId  → VENDOR_LOCATION_*[_VENDOR_MISMATCH]
      if vendorContactId:  getVendorContact  + assert .vendorId === vendorId  → VENDOR_CONTACT_*[_VENDOR_MISMATCH]
      getDispatchAssignmentStatusByCode("DRAFT") → STATUS_NOT_FOUND
      findCandidateVendorsForJob(...) → find this vendor → VENDOR_NO_LONGER_CANDIDATE   -- D-5.25 (re-derive)
        capture facets: matched_trade_id, matched_trade_was_primary, tightest_geo, matched_geo_types, compliance
      chosen_branch_covered_trade = vendorLocationId ? branchCoversTrade(...) : null     -- D-5.8

      -- one DB transaction (3 inserts) --
      1. INSERT job_vendor_assignments (DRAFT + immutable facet snapshot + optional fields)
      2. INSERT job_vendor_assignment_status_history (from=NULL → DRAFT, changed_by=creator)
      3. tx.insert(audit_logs) (job_vendor_assignment.created)   ← audit INSIDE the txn (D-5.22)
      -- NO job_events row (R-5.5: a draft is operator workspace, not a job milestone — the timeline narrates job lifecycle, not draft churn)

  → reload via getAssignment → redirect("/jobs/[id]/dispatch/[newId]")
```
**Why this shape:**
- *Re-derive the matcher server-side (D-5.25):* the UI's matcher run was display-only; re-deriving guarantees the snapshot is consistent and rejects a vendor that dropped out since form-load (`VENDOR_NO_LONGER_CANDIDATE`).
- *No `job_events` row (R-5.5):* drafts don't appear on the job timeline — they're operator workspace. The timeline narrates milestones (the `job.dispatched` send), not draft churn. Drafts surface in the job's Dispatch *section* (current-state view), not the timeline.
- *Audit inside the txn (D-5.22 / R-4.5):* the assignment + history + audit must be atomic — same reasoning as `createJob`.
- *Simpler than createJob:* no per-tenant counter (assignments aren't numbered), no job-side write — a clean 3-write block.

## WF-5.3 — Send a dispatch (dual-entity, parent-before-child lock-then-check)
```
/jobs/[id]/dispatch/[assignmentId] (SendDispatchButton, client) → sendDispatchAction(assignmentId)
  → requireTenant()
  → sendDispatch({ tenantId, assignmentId, actorUserId })

      -- read-only guards (BEFORE the txn) --
      getAssignment → ASSIGNMENT_NOT_FOUND; must be DRAFT → ASSIGNMENT_NOT_DRAFT
      resolve DRAFT + SENT dispatch statuses → STATUS_NOT_FOUND
      getJob(assignment.jobId) → JOB_NOT_FOUND
      build job-status id⇄code map; resolve DISPATCHED id
      job.currentStatus ∈ DISPATCHABLE {NEW,SCHEDULED,DISPATCHED,IN_PROGRESS,ON_HOLD} → else JOB_NOT_DISPATCHABLE
      getVendor → vendorName (for the timeline summary)

      -- one DB transaction (lock-then-check, parent before child — D-5.12) --
      1. SELECT jobs.current_status_id WHERE id=jobId FOR UPDATE          (lock PARENT first)
      2. SELECT assignment.current_status_id WHERE id=aId  FOR UPDATE     (lock CHILD; re-check DRAFT → ASSIGNMENT_NOT_DRAFT)
      3. re-check locked job still dispatchable → else JOB_BECAME_TERMINAL
      4. UPDATE assignment → SENT, sent_at = now()
      5. INSERT job_vendor_assignment_status_history (DRAFT → SENT)
      6. tx.insert(audit_logs) (job_vendor_assignment.sent)               ← ALWAYS
      7. INSERT job_events (job.dispatched, "Dispatched to <vendor>")      ← ALWAYS (per send)
      8. CONDITIONAL — if locked job ∈ ADVANCE {NEW,SCHEDULED}:           -- D-5.10
           a. UPDATE jobs.current_status_id → DISPATCHED
           b. INSERT job_status_history (prev → DISPATCHED)
           c. tx.insert(audit_logs) (job.dispatched, target=job)

  → reload getAssignment → { assignment, jobStatusAdvanced }
  → action revalidatePath(assignment detail + parent job); no redirect (page re-renders as SENT)
```
**Why this shape:**
- *Lock parent-before-child + re-check (D-5.12):* between the pre-txn guard and the mutation another operator could move the job or send the same draft. Locking the job then the assignment `FOR UPDATE` serializes concurrent senders; re-checking the assignment is still DRAFT prevents a double-send; re-checking the job is still dispatchable catches a race to terminal (`JOB_BECAME_TERMINAL`). This is the canonical multi-entity pattern (mirrors `createJob`'s counter `FOR UPDATE`, applied to two entities).
- *Event always, advance conditionally (D-5.10):* `job.dispatched` fires on **every** send (a per-vendor milestone — "Dispatched to Vendor Y"); the job status advances **only** from NEW/SCHEDULED, so re-dispatching a job that's already DISPATCHED/IN_PROGRESS doesn't regress it. Event count ≠ status-change count by design (R-5.9).
- *Domain verb, not generic (R-5.6 / R-4.11):* the job-side event is `job.dispatched` (the createJob precedent used `job.created`, not `job.status_changed`); the typed transition lives in `job_status_history`.
- *Audit counts (R-5.4):* 1 audit row on a re-dispatch (assignment.sent only), 2 on the first send (assignment.sent + job.dispatched). Audit logs mutations that happened; events describe milestones — they don't 1:1.

## WF-5.4 — Render the job's Dispatch section
```
/jobs/[id] (server) → Promise.all([..., listAssignmentsForJob(tenantId, id)])
  → if !job.primaryTradeId: "Assign a trade before dispatching" (CTA gated off — no matcher run here)
  → else if no assignments: "No vendors dispatched yet." + "Dispatch a vendor" CTA
  → else: card per assignment (DispatchStatusBadge by category + vendor + branch/schedule/NTE + compact facet line)
```
**Why CTA-gating reads the job, not the matcher:** the trade check is a cheap field read from `getJobDetail`; running the matcher on every job-detail render just to decide CTA enablement would be wasteful. The "has trade but no candidates" case is handled on the form page, not here — so the job detail never runs the matcher. Badge colors are semantic and app-wide (D-5.16). The facet line is **compact** here ("Primary trade: HVAC · National service area · No compliance data"); the assignment workspace renders it **verbose**.

## WF-5.5 — The new-dispatch form: matcher-candidate picker + pre-fill
```
/jobs/[id]/dispatch/new (server): getJobDetail; findCandidateVendorsForJob; enrich each candidate
  with listVendorLocations + listVendorContacts → NewDispatchForm (client)
  - candidates.length === 0 → guidance ("a vendor needs active <trade> coverage + a service area covering <location>")
  - single candidate → "selected" info panel; multiple → radio-card list, top-ranked pre-selected   -- D-5.15
  - branch/contact pickers key={selectedVendorId} (remount on vendor change — R-4.12); single→auto, primary contact pre-selected
  - scheduled start = tomorrow 9am (server-computed prop, no hydration mismatch); end/NTE blank
  - scope pre-filled: approvedScopeOfWork ?? scopeOfWork ?? problemDescription; conditional label (D-5.23)
```
**Why this shape:**
- *Pre-fill discipline (D-5.15):* every blank field is a decision; the canonical 1-candidate/1-branch/1-contact dispatch is ~7 clicks because the form pre-selects everything obvious and asks only for the NTE.
- *Candidate match badges = the snapshot (D-5.14):* each candidate shows "Primary trade: HVAC · National service area · No compliance data" — the same facets that become the immutable snapshot, so it's WYSIWYG. "Primary trade" is scoped wording (never bare "primary").
- *Dependent pickers reuse R-4.12:* all candidates' branches/contacts ship with the page; the branch/contact `<select key={selectedVendorId}>` remount resets to the new vendor's defaults when the vendor changes. The server `*_VENDOR_MISMATCH` guards back it.
- *Scope fallback + conditional label (D-5.23):* a job created without a scope still pre-fills (from the problem description), and the label says so — streamlining without misleading the operator.

## WF-5.6 — The Send button (server action with the useActionState wrapper)
```
SendDispatchButton (client): action = sendDispatchAction.bind(null, assignmentId); useActionState(action, null)
  <form action={formAction}><button>Send dispatch</button></form>  + inline pending/error
```
**Why a thin client wrapper, not a plain server-action form:** the Send button is a server action (no client fetch), but error display + pending state need `useActionState` — the Phase 4 form precedent. On success the action `revalidatePath`s the workspace + parent job; the page re-renders as SENT and the Send button (shown only while `status === DRAFT`) disappears. No redirect — the operator stays in the workspace.

## WF-5.7 — Cross-tenant protection & nested-route guards
```
getAssignment / getAssignmentDetail / listAssignmentsForJob: WHERE tenant_id = ? → null/empty (never leak)
assignment detail: getAssignmentDetail(tenantId, assignmentId); notFound() if null OR assignment.jobId !== route [id]
```
**Why the `jobId === route-id` guard:** the assignment workspace nests under `/jobs/[id]/dispatch/[assignmentId]`. Beyond tenant-scoping, the page asserts the assignment actually belongs to the job in the URL — defense against a tampered/stale URL that pairs a real assignment with the wrong job. Same `*_NOT_FOUND`-style discretion as Phase 4 (no cross-tenant existence leak, R-4.6).
