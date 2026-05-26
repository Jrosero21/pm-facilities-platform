# Phase 5 — Known Limitations

Everything intentionally not built, done "for now," or worth knowing before later phases. Includes carry-forwards. Inherits the still-load-bearing Phase 1–4 gotchas (InnoDB-must-be-forced, 64-char identifier guard, case/accent-insensitive collation, no tenant-switcher UI, JobForm-ships-all-locations, seed-on-tenant-creation deficit, no pagination/search, scope columns inert until Phase 7).

## L-5.1 — No aggregator-designated primary vendor / auto-dispatch
The matcher surfaces capable candidates; the operator picks **every** dispatch manually. A future feature lets an aggregator designate a primary vendor per (client, location, trade) for auto-dispatch routing. Not Phase 5 scope. **The word "primary" in Phase 5 refers only to a vendor's primary trade specialty, never to vendor designation** (R-5.10 / D-5.14). **Carry-forward:** the designation + auto-dispatch feature (Phase 6+/9).

## L-5.2 — `dispatch_messages` has no recipient or delivery fields
The table records message content + metadata (`direction`, `message_type`, `subject`, `body`, `visibility`) only. There is **no** recipient routing (no `recipient_contact_id`/`recipient_email`/CC/BCC/channel fields) and **no** delivery tracking (`delivered_at`/`read_at`). Phase 5 does not send — the operator forwards messages manually outside the system. The recipient for an assignment's messages is implicitly the assignment's `vendor_contact_id`. **Carry-forward (Phase 6):** the recipient layer + the delivery layer, on this content schema. (D-5.18/D-5.19.)

## L-5.3 — ETA, check-in/out, and messages have schema but no UI
`vendor_eta_confirmations` (append-only; latest by `created_at` is the current ETA), `vendor_check_ins`, `vendor_check_outs`, and `dispatch_messages` exist but have **no data-layer write functions or screens**. The assignment workspace deliberately omits these sections. **Carry-forward (Phase 6):** the ETA capture, check-in/out logging, and message thread UI.

## L-5.4 — Radius and county service areas are inert
The matcher's geo predicate is **equality-only** (`national`/`state`/`city`/`postal_code`). `radius` service areas can't be evaluated (no client-location coordinates — Phase 2 L-2.8 / Phase 3 L-3.4); `county` can't (no county column). Such rows are stored but never match. **Sunset/carry-forward:** radius matching when coordinates land; county matching when a county column is added.

## L-5.5 — Compliance is non-blocking when absent (temporary)
A vendor with no compliance rows is eligible (`no_data`); only an active `expired`/`non_compliant` row excludes. With zero compliance data, hard-gating would exclude every vendor. **Sunset/carry-forward:** when real compliance data starts landing for any vendor, this rule **must** flip — vendors *without* compliance data should become flagged/excluded, not preferred. The current rule would silently include undocumented vendors while excluding well-documented ones once partial data exists, which is backwards.

## L-5.6 — No performance / proximity ranking
Candidate ranking is primary-trade → tightest-geo → name. There is no performance-score ranking (`vendor_performance_scores` is empty — Phase 9 computes it) and no geographic-proximity ranking (needs coordinates). **Carry-forward (Phase 9):** richer ranking once perf data + coordinates exist.

## L-5.7 — Matcher uses correlated subqueries
`findCandidateVendorsForJobByFacets` evaluates trade/geo/compliance via correlated `EXISTS`/scalar subqueries per vendor. At Phase 5 scale (1 demo tenant, single vendor, two trades, one client location) the 5a EXPLAIN confirmed all predicates resolved via index range scans with no full-table scans or filesort. The watchpoint is vendor count growth — when an active vendor pool per tenant exceeds the low hundreds, the correlated-EXISTS pattern is the first thing to profile. **Carry-forward (Phase 9):** if profiling shows the pattern is the bottleneck, consider a JOIN + GROUP BY rewrite.

## L-5.8 — `GROUP_CONCAT` default byte limit
`matched_geo_types_at_dispatch` is built from `GROUP_CONCAT(DISTINCT area_type)` in the matcher; MariaDB's default `group_concat_max_len` (1024) is far above the handful of short area-type tokens involved. Not hit at any realistic scale; noted for completeness.

## L-5.9 — MariaDB JSON columns report as `longtext`
`matched_geo_types_at_dispatch` (Drizzle `json()`) is stored as `longtext` + an auto-added `CHECK (json_valid(...))` on MariaDB 11.4. `information_schema.COLUMNS.DATA_TYPE` = **`longtext`**, never `json`; JSON functions work. Not a defect — expect `longtext` + the `json_valid` CHECK when verifying. (`08-db-changes.md`; same as Phase 4 `job_events.metadata`.)

## L-5.10 — No assignment edit / archive / accept / decline / cancel UI
Assignments support **create + send + view** only. No edit, archive, or cancel UI; accept/decline are vendor-side (Phase 10 vendor portal). The status set has 9 codes but Phase 5 only drives DRAFT→SENT. **Carry-forward:** the remaining status transitions across Phases 6/10.

## L-5.11 — Dispatching from ON_HOLD does not lift the hold
A job in ON_HOLD is dispatchable, but sending leaves it ON_HOLD (the advance set is {NEW, SCHEDULED} only). The operator must explicitly transition the hold via a future `updateJobStatus`/`liftHold` action — workflow transitions are explicit, never implicit side effects (R-5.8). **Carry-forward:** the explicit status-transition actions (lift-hold, mark-complete, etc.).

## L-5.12 — Setup/test data present (the worked examples)
The `demo` tenant contains Phase 5 verification data, left in place as worked examples: **9 global** `dispatch_assignment_statuses`; **Job #2** (HVAC, New York NY, status Dispatched) with **one SENT assignment** to Sunbelt HVAC (vendor-wide), its status-history (null→DRAFT, DRAFT→SENT), one `job.dispatched` event, and the `job_vendor_assignment.created`/`.sent` + `job.dispatched` audit rows; `tenant_job_sequences.next_number` = 3. **Job #1** (Plumbing, NYC, New) is the no-candidate example (no dispatch). Real, append-only records (the worked examples in `07-chatbot-knowledge.md` K-5.11).

## L-5.13 — "Vendor-wide" label is jargon-y (copy polish opportunity)
Dispatch cards label a no-branch assignment "Vendor-wide", which is accurate but jargon-y for some operators. Not a Phase 5 priority; a copy-polish opportunity. **Carry-forward:** revisit dispatch copy when the Phase 6 communication surfaces are designed.

## L-5.14 — `dispatch_messages.direction` is forward-looking
`direction` (outbound/inbound, default outbound) is added now because Phase 6 §9 structurally distinguishes the two — but Phase 5 has no inbound path and only ever writes outbound (in fact writes none, since there's no message UI yet). Same forward-pointer rationale as Phase 4's `job_notes.visibility`. **Carry-forward (Phase 6):** the inbound message path.
