# v2 — 17a Inspection Report

**Status:** read-only inspection sweep (v2 sub-batch 17a). No build / schema / migration performed.
**Branch:** `phase-17-v2-inspection` cut + pushed off `main@ea5b613` (v1 close, tag `v2.0.0-phase-16`).
**Scope of this doc:** pure findings of the live surfaces v2 ("the road to aggregator autonomy")
will extend. File paths + row-counts cited. NO recommendations. The v2 roadmap is authored
separately, after this report is read.

---

## 1. Operator / dashboard surfaces (Phase 9) — readers AND a live UI

**Server readers (`src/server/analytics/`), all `(tenantId, …)`-scoped:**
- `countOpenJobsByStatus`, `countOpenJobsByPriority`, `topClientsByOpenJobs`, `topTradesByOpenJobs` (`open-jobs.ts`)
- `countStalledJobs`, `isJobStalled` (`stalled-jobs.ts`); `isStalled` (`stalled-rules.ts`)
- `operationalQueue(tenantId, limit=20)` (`operational-queue.ts`)
- `timeToDispatchDistribution` (`dispatch-timing.ts`); `timeInStatusDistribution` (`time-in-status.ts`)
- `countPendingInvoices` (`pending-invoices.ts`); `percentile`/`summarizeSeconds` (`percentile.ts`)

**There IS a live operator UI** — not just readers: `src/app/(app)/dashboard/page.tsx` consumes
all the above behind role gates (`canSeeOperations`/`canSeeFinancials` from `role-predicates.ts`),
rendering ops + financial panels. The operator app shell `(app)` also has full CRUD route trees
for clients, vendors (incl. coverage/locations), and jobs (dispatch, proposals, change-orders,
client/vendor invoices, payments). So an "operator portal" is not a greenfield surface — it
exists; v2 extends it.

## 2. Vendor portal (Phase 10) — WIRED end-to-end

Route group `src/app/(vendor)/vendor/`. Per Phase-10 deliverable:

| Deliverable | State | Evidence |
|---|---|---|
| Accept / decline dispatch | **WIRED** | `assignment-actions.ts` `acceptDispatch`/`declineDispatch` → `(vendor)/vendor/jobs/actions.ts` `acceptDispatchAction`/`declineDispatchAction` → bound in `(vendor)/vendor/jobs/[id]/page.tsx` |
| Confirm ETA | **WIRED** | `confirmEta` + `confirmEtaAction` + `vendor/vendor-eta-form.tsx` |
| Confirm schedule | **WIRED** | `confirmSchedule` + `confirmScheduleAction` (button on detail page) |
| Mark on-site | **WIRED** | `markOnSite` + `markOnSiteAction` |
| Mark work complete | **WIRED** | `markWorkComplete` + `markWorkCompleteAction` |
| Vendor note | **WIRED** | `vendor/create-vendor-note.ts` + `vendor/jobs/note-actions.ts` + `vendor/vendor-note-form.tsx` |
| Photo upload | **PARTIAL** | `create-vendor-photo-placeholder.ts` + `photo-actions.ts` + `vendor-photo-placeholder-form.tsx` — a **placeholder** (metadata row; no real file-storage backend) |
| Invoice submit | **WIRED** | `vendor/submit-vendor-invoice.ts` + `(vendor)/vendor/jobs/[id]/invoices/new/actions.ts` |
| Operator review of vendor updates | **PARTIAL** | vendor notes/updates land via `vendor_update_logs` substrate; an operator vendor-updates *inbox* is banked (FB-10a.1/.3) |

State machine in the vendor job detail: `ACCEPTED → confirmEta → SCHEDULED → confirmSchedule →
CONFIRMED → markOnSite → … → markWorkComplete`. Vendor scope enforced via `requireVendor` +
`vendorScope` set.

## 3. Client portal (Phase 11) — brief

Route group `src/app/(client)/client/`: jobs list + detail + **new-job submission**
(`client/jobs/new` + `new-job-form.tsx`, server action writes a scope-pinned client job),
locations view, invoices view, proposal-accept (`proposal-accept.tsx`), client notes
(`client-note-form.tsx`). Client scope via `requireClient` + `clientScope` set. v2 touches this
surface less.

## 4. Autonomy-policy substrate (the engine's bones) — EXISTS, but binary

**Tables (live):** `agent_policies` (`tenant_id` NN, `client_id` nullable, `agent_id`, `policy`
longtext-JSON, `version`, `status` enum draft/active/archived) + `agent_policy_defaults`
(`agent_id`, `policy`, `version`, `status`).

**Resolver (live):** `src/server/agents/config/policies.ts` — `resolveAgentPolicy(tenant, agent,
client?)` falls through (tenant,client) → (tenant,agent) → defaults; **fail-safe to
`{requiresReview: true}`**; never throws.

**What the policy models TODAY:** only `ResolvedPolicy = { requiresReview: boolean }`. The two
seeded `agent_policy_defaults` rows (`scope_generator_v1`, `update_rewriter_v1`) are both
`{"requiresReview":true}`, `status='active'`. `agent_policies` (tenant overrides) has **0 rows**.

**Gap for v2:** there is **no autonomy / auto-execute / enabled / threshold field** — the policy
vocabulary is the single binary `requiresReview`, and the auto-execute disposition branch is inert
(carried from Phase 7 L-7.1; `disposition='auto_executed'` exists in the enum but is never
emitted). So the *table + resolver bones exist*, but the autonomy semantics (auto-execute,
per-action thresholds, per-tenant enablement) are net-new modelling on top of this substrate.

## 5. Dispatch model + eligibility (Phases 5 + 3)

**Functions:** `vendor-matching.ts` — `findCandidateVendorsForJob` / `findCandidateVendorsForJobByFacets`
(the candidate-set matcher). `dispatch.ts` — `getAssignment`, `listAssignmentsForJob`,
`getAssignmentDetail`, `createDispatch`, `sendDispatch` (all operator-driven, draft-then-send).

**Preferred-vendor-per-location concept:** **does not exist** (grep for `preferred`/`preferred_vendor`
→ zero hits anywhere in `src`).

**Eligibility data (live row counts):**
| Table | Rows |
|---|---|
| `vendor_trade_coverage` | 2 |
| `vendor_service_areas` | 3 |
| `vendor_compliance` | 0 |
| `vendor_rates` | 0 |
| `vendor_performance_scores` | **0** (empty — confirms the data-blocked-scoring finding) |
| `job_vendor_assignments` | 1 |

So a routing/scoring engine has a working **candidate-set matcher** (trade + service-area facets)
but **no scoring inputs** (`vendor_performance_scores` and `vendor_rates` empty), **no
preferred-vendor** concept, and **no autonomy** layer.

## 6. Notification / comms substrate (Phase 6) — no live send

**Tables:** `communication_logs` (the spine: channel, direction, `source_type`/`source_id`,
visibility, `delivery_status` enum, recipient fields, summary), `outbound_messages`,
`inbound_messages`, `portal_update_queue`, `email_templates` (Mustache bodies, no render pipeline).

**Send wiring:** **none.** No mail/SMS provider is wired anywhere in `src/server` (grep for
`nodemailer`/`twilio`/`sendgrid`/`resend`/`smtp` → zero). `communications.ts` only **advances a
status** (`updateCommunicationDeliveryStatus`, a legal-transition state machine); a comm starts at
`delivery_status='draft'` and "Send" is a **manual status flip** (`set.sentAt = now()`), not an
actual outbound dispatch. So a notification center needs a real send backend (net-new); the
log/queue/template substrate to build it on exists.

## 7. Table + migration baseline (v2 start)

- **Tables:** **115** (incl. `__drizzle_migrations`).
- **Latest migration:** **0041** (`0041_charming_william_stryker.sql`). Next free: **0042**.

This is the v2 baseline; 17a added nothing.
