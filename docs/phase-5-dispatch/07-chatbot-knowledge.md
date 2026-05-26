# Phase 5 — Chatbot Knowledge

Source-of-truth for how dispatch works after Phase 5. Written to stand alone: an LLM with only this file should answer operational questions correctly. Cross-references `02-decisions.md`, `06-business-rules.md`, `08-db-changes.md` but does not depend on them. Builds on Phase 3 (vendors/coverage/service-areas) and Phase 4 (jobs) chatbot knowledge.

## K-5.1 — What Phase 5 adds
The aggregator can now **dispatch vendors to jobs**. For a job, the system surfaces the **candidate vendors** that can do the work and serve the area (the Phase 3 capability layer meeting the Phase 4 job), the operator picks one, captures a **dispatch** at DRAFT, and **sends** it — which notifies the vendor and moves the job to **Dispatched**. Each dispatch records an immutable **snapshot of why the vendor matched**. Dispatch is **advisory + manual**: the system suggests; the operator decides every dispatch. Create + send + view only — no edit/accept/decline UI.

## K-5.2 — The 7 tables and how they relate
All ids are app-generated UUID v7 (`varchar(36)`), InnoDB / utf8mb4. All carry `tenant_id` **except `dispatch_assignment_statuses`** (GLOBAL).
```
dispatch_assignment_statuses (GLOBAL)          jobs (Phase 4)    vendors / vendor_locations / vendor_contacts (Phase 3)
            │                                       │                     │
            └───────────────► job_vendor_assignments ◄────────────────────┘   (the dispatch spine)
                                       │  current_status_id / matched_trade_id (snapshot) / agreed_nte / dispatch_scope / facets
                                       ├──< job_vendor_assignment_status_history (from/to status_id)
                                       ├──< dispatch_messages          (direction/type/body/visibility — content only)
                                       ├──< vendor_eta_confirmations   (append-only ETA log; latest = current ETA)
                                       ├──< vendor_check_ins           (occurred_at/note)
                                       └──< vendor_check_outs          (occurred_at/note — identical v1 shape)
```
- **`job_vendor_assignments`** — the spine. `tenant_id`, `job_id`→jobs (cascade), `vendor_id`→vendors (RESTRICT), `vendor_location_id`→vendor_locations (RESTRICT, **nullable** = vendor-wide), `vendor_contact_id`→vendor_contacts (set null, nullable), `current_status_id`→dispatch_assignment_statuses (RESTRICT), `agreed_nte_amount` (decimal, null — NTE/DNE synonym), `scheduled_start_at`/`scheduled_end_at` (datetime, null), `dispatch_scope` (text, immutable snapshot), the **facet snapshot** (`matched_trade_id`→trades RESTRICT, `matched_trade_was_primary` bool, `tightest_geo_at_dispatch` enum, `matched_geo_types_at_dispatch` json, `compliance_status_at_dispatch` enum, `chosen_branch_covered_trade` bool null), `sent_at` (datetime, null until sent), `created_by_user_id`, timestamps. **No `(job_id, vendor_id)` uniqueness** — a job can have many dispatches (re-dispatch, multi-trade, comparing offers).
- **`dispatch_assignment_statuses`** *(GLOBAL)* — `code`, `name`, `description`, `category` enum(draft,pending,active,completed,cancelled), `sort_order` (10-step), `is_terminal`, `status`. Unique `(code)`/`(name)`. No `tenant_id`.
- **`job_vendor_assignment_status_history`** — append-only typed transitions: `from_status_id` (nullable; null on first), `to_status_id` (NN), `changed_by_user_id`, `note`, `created_at`. Mirrors `job_status_history`.
- **`dispatch_messages`** — `direction` enum(outbound,inbound) default outbound, `message_type` varchar(64), `subject`, `body`, `visibility` enum (default internal_only), `sent_by_user_id`, `status`, timestamps. **No recipient/delivery fields** (Phase 6 owns those).
- **`vendor_eta_confirmations`** — append-only ETA log: `eta_start_at` (NN), `eta_end_at`, `note`, `confirmed_by_user_id`, `created_at`. Latest by `created_at` is the current ETA.
- **`vendor_check_ins` / `vendor_check_outs`** — identical v1 shape: `occurred_at` (NN), `note`, `recorded_by_user_id`, `created_at`.

## K-5.3 — The 9 dispatch statuses
`DRAFT` (draft — operator workspace, not yet sent), `SENT` (pending — sent, awaiting the vendor), `ACCEPTED` (active), `DECLINED` (cancelled, terminal), `SCHEDULED` (active), `CONFIRMED` (active), `ON_SITE` (active), `WORK_COMPLETE` (completed, terminal), `CANCELLED` (cancelled, terminal). `category` groups them; **DECLINED and CANCELLED are distinct codes sharing the `cancelled` category** (decline-rate stays computable from the code). GLOBAL, resolved by code like `job_statuses`. Phase 5 only drives DRAFT → SENT; the rest are reserved for later phases (ACCEPT/DECLINE are vendor-side, Phase 10).

## K-5.4 — The matcher (`findCandidateVendorsForJob`)
Given a job's trade + client-location facets, it returns the active vendors that are **trade-eligible** (active `vendor_trade_coverage` for the trade) **and** **geo-eligible** (active `vendor_service_areas` covering the location) **and** **compliance-eligible**, ranked **primary-trade → tightest-geo → name**. Key v1 behaviors (all with documented sunset triggers):
- **Geo is equality-based** on `national`/`state`/`city`/`postal_code`. **`radius` and `county` service areas are inert** — no client-location coordinates (for radius) and no county column (for county) exist yet.
- **Compliance is non-blocking when absent** — a vendor with no compliance rows is eligible (`no_data`); only an active `expired`/`non_compliant` row excludes. **This is a temporary v1 rule with an explicit sunset:** as soon as compliance data starts landing for any vendor, this rule flips — vendors *without* compliance data become flagged or excluded (not preferred). The partial-data state under the v1 rule would silently exclude well-documented vendors while including undocumented ones, which is backwards.
- Trade- and geo-eligibility are **independent vendor-level predicates** (coverage and service-area may be at different branches); the branch-join is compensated by the operator picking a branch + the `chosen_branch_covered_trade` snapshot.
- No performance/proximity ranking (no perf data, no coordinates).

## K-5.5 — The facet snapshot (why a vendor was matched, frozen at dispatch)
Every assignment denormalizes *why* the vendor matched, **immutable** after creation: `matched_trade_id` (the trade, a snapshot — equals the job's primary trade at dispatch but won't drift if the job's trade later changes), `matched_trade_was_primary` (was it the vendor's primary trade specialty), `tightest_geo_at_dispatch` + `matched_geo_types_at_dispatch` (how the area matched), `compliance_status_at_dispatch`, `chosen_branch_covered_trade` (does the *specific branch the operator picked* carry the trade — null if vendor-wide; a separate query, not matcher output). The snapshot is **re-derived server-side at submit** (the UI's matcher run is display-only); if the vendor dropped out of the candidate set since form-load, the create is rejected `VENDOR_NO_LONGER_CANDIDATE`.

## K-5.6 — Draft-then-send
`createDispatch` lands the assignment at **DRAFT** — operator workspace; nothing is sent to the vendor, and **nothing appears on the job timeline** (a draft isn't a job milestone). `sendDispatch` moves it **DRAFT → SENT** (the vendor is notified) and advances the job to **Dispatched**. The create form has no status picker — DRAFT is automatic. This draft-then-send shape serves two purposes: operator review before notifying the vendor, and forward-compatibility with the §2.9 principle (a future AI agent may draft a dispatch, but a human performs the send — the agent never auto-sends state changes).

## K-5.7 — The dual-entity transaction (sendDispatch)
`sendDispatch` mutates two entities atomically, locking **parent before child** (job `FOR UPDATE`, then assignment `FOR UPDATE`, then re-check both under the locks — the canonical multi-entity pattern; prevents deadlocks and double-sends). It **always** writes: assignment → SENT + `sent_at`, a status-history row (DRAFT→SENT), an audit row (`job_vendor_assignment.sent`), and a `job_events` row (`job.dispatched`, "Dispatched to <vendor>"). It **conditionally** advances the job: only when the job is in **{NEW, SCHEDULED}** does it move the job to DISPATCHED + write `job_status_history` + an audit (`job.dispatched`, target=job). Dispatching a job that's already DISPATCHED/IN_PROGRESS/ON_HOLD records the new dispatch (and fires `job.dispatched` every send) but **does not change the job's status** — it never regresses an in-progress job, and never auto-lifts a hold (workflow transitions are explicit, never implicit side effects).

## K-5.8 — Dispatchable vs advance, and the explicit-transitions rule
Two distinct sets: a job is **dispatchable** (you can send a dispatch from it) in {NEW, SCHEDULED, DISPATCHED, IN_PROGRESS, ON_HOLD}; sending **advances** the job to Dispatched only from {NEW, SCHEDULED}. Terminal jobs (Completed/Cancelled/Closed) reject dispatch. **Explicit-transitions rule:** an operation that *could* logically advance a status never silently does so — dispatching from ON_HOLD leaves the job ON_HOLD; the operator lifts the hold with a deliberate action. (Generalizes to Phase 6/7/8: note publication, scope approval, invoice creation never silently advance job status.)

## K-5.9 — "Primary" precision (the most important wording in Phase 5)
When the UI or a match summary says **"Primary trade: HVAC"**, it means HVAC is **that vendor's primary trade specialty** (their self-described expertise — Phase 3 `is_primary` on a coverage row). It does **NOT** mean "the aggregator's primary vendor for this job." Aggregator-designated primary vendors (a vendor designated as the go-to for a (client, location, trade) combination, enabling auto-dispatch routing) is a **future feature that does not exist in Phase 5**. The matcher is advisory; the operator picks every dispatch manually. Never describe a Phase 5 vendor as "the primary vendor" — only as having a "primary trade."

## K-5.10 — Audit & event vocabularies
`audit_logs` (`<entity>.<verb>`, inside the dispatch transactions per R-4.5): `job_vendor_assignment.created` (createDispatch), `job_vendor_assignment.sent` (sendDispatch, every send), `job.dispatched` (sendDispatch, **only** when the job advances NEW/SCHEDULED → DISPATCHED). On a re-dispatch (job already Dispatched) only `job_vendor_assignment.sent` is written — **audit-row count ≠ event count by design**. `job_events.event_type` adds **`job.dispatched`** (a specific domain verb, not generic `job.status_changed`); it fires on **every** send. The dispatch-reference seed writes no audit rows (bootstrap data).

## K-5.11 — Worked examples
- **Job #1** (`demo` tenant) — Plumbing, New York NY, status **New**. It has **no dispatch**: clicking "Dispatch a vendor" shows "No vendors match this job" because no vendor has active Plumbing coverage serving NYC. The **no-candidate** example.
- **Job #2** (`demo` tenant) — HVAC, New York NY, status **Dispatched**. One assignment to **Sunbelt HVAC**, **vendor-wide** (no branch), status **Sent**, `sent_at` populated. Its snapshot: matched trade HVAC (the vendor's **primary trade**), tightest geo **national**, compliance **no_data**, chosen-branch **n/a (vendor-wide)**. Sending it wrote: assignment DRAFT→SENT, two status-history rows (null→DRAFT, DRAFT→SENT), `job_vendor_assignment.created` + `job_vendor_assignment.sent` audits, one `job.dispatched` event, and — because the job was NEW — the job→DISPATCHED advance (`job_status_history` + `job.dispatched` audit, target=job). The **successful-dispatch** example.

## K-5.12 — What does NOT exist yet (do not claim these)
- **No ETA / check-in / check-out UI** — the tables (`vendor_eta_confirmations`, `vendor_check_ins`, `vendor_check_outs`) exist but have no screens. **Phase 6.**
- **No message sending or delivery tracking** — `dispatch_messages` records content + metadata only; there is no recipient routing, no send/bounce/read tracking, no recipient/CC/channel fields. Operators forward messages manually outside the system. **Phase 6** owns the delivery layer.
- **No accept / decline** — those are vendor-side actions (**Phase 10** vendor portal). Phase 5 only drives DRAFT → SENT.
- **No assignment edit / archive / cancel UI** — create + send + view only.
- **No status transitions beyond DRAFT→SENT and the NEW/SCHEDULED→Dispatched job advance** — no lift-hold, mark-complete, etc.
- **No aggregator-designated primary vendor / auto-dispatch** — the matcher is advisory; there is no "primary vendor" designation and no automatic routing. (Future feature.)
- **No radius/county geo matching** (inert until coordinates/county land); **no compliance hard-gating** (non-blocking until data lands); **no performance/proximity ranking** (Phase 9).
- **No external-system dispatch** — dispatching to ServiceChannel or any external portal is not built; Phase 5 is internal operator dispatch only.
