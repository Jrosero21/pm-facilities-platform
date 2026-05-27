# Phase 8 — 8a Design Proposal: Billing, Proposals, and Change Orders

**Status:** **approved at 8a review** — all 27 open questions are **LOCKED** (§N) and **Surface 23 (Client NTE configuration)** is added · **doc-only; no code / no SQL / no migration / no schema** · **hold before 8b** — do **not** open the schema gate without explicit go-ahead.
**Batch rhythm:** mirrors 7a/6a — settle the surfaces, lock the decisions, *then* schema (8b) → data layer → UI → docs. Substrate first; any agent comes after (surface #22, locked-deferred).
**Goal (roadmap §8 Phase 8):** support vendor invoices, client invoices, proposals, and change orders, with billing events and a job billing section — without building "a full accounting system," "payment processor integration," or "advanced margin analytics unless simple" (§8 *Do not build*).

This document enumerates **23 surfaces** in the brief's groups. Each is **(a) what it is / why lock now · (b) options · (c) recommendation + rationale · (d) prior-phase retrofit consequence · (e) open questions for operator review**. Where a call is an architecture/consistency decision derivable from precedent, it is **made** with rationale; where it depends on business policy, risk tolerance, or MVP scope, it was **surfaced** in §N (the open-questions register) — and at the 8a review **all of them are now resolved (LOCKED)**. Each surface carries a **LOCKED at 8a review** tag recording the settled answer.

---

## §A — Inheritance from prior phases: reuse, do not redesign

*Rev note (refined at 8b review): the §A framing below originally called `is_tax_exempt` "the one Phase-2 schema-only retrofit." That was a working hypothesis. At 8b, **8b-D1 LOCKED Option B** — the per-client `emergency_nte_multiplier` also lands on `client_billing_rules`. Both are per-client billing **policy**, so they co-locate with the existing billing-config substrate ("co-locate with the substrate of the same type" supersedes the column-count framing). `client_billing_rules` carries **two** new policy columns; **no other prior-phase table is touched.***

Confirmed against the live repo and live-phase docs (source-of-truth §5.2). Inherited unchanged unless a surface says otherwise:

- **Money precedent (live schema).** `decimal(12,2)` is the established **amount** type — `jobs.not_to_exceed_amount` (`jobs.ts:87`), `job_vendor_assignments.agreed_nte_amount` (`dispatch-assignments.ts:79`), `vendor_rates.amount` (`vendor-details.ts:60`). `decimal(14,2)` is the established **larger-sum** type (`vendor_compliance.coverage_amount`). `decimal(6,3)` is the established **percent** type (`client_billing_rules.markup_percent`). Phase 8 holds the `(12,2)` convention for **all** priced money (surface #1, OQ-1 locked).
- **Currency precedent (live schema).** `vendor_rates.currency varchar(3) NOT NULL default 'USD'` (`vendor-details.ts:61`) — the platform **already** carries a per-record currency code. Phase 8 follows this, it does not invent it (surface #2). *(The brief framed currency as an open MVP choice; the repo already answers the shape.)*
- **Source-agnostic pattern (§2.1).** `jobs.source_type` is an 8-value `mysqlEnum` default `manual` + nullable `source_external_id varchar(255)` with **no uniqueness** (D-4.13). The model Phase 8 copies for `vendor_invoices` (surface #5).
- **Two NTE levels already exist — and Phase 8 reveals their *source*.** Job-level `jobs.not_to_exceed_amount` **and** per-dispatch `job_vendor_assignments.agreed_nte_amount`. Phase 5's forward pointer hands **edits of a *sent* dispatch's scope/NTE to Phase 8** (`docs/phase-5-dispatch/08-db-changes.md:58`); the dispatch snapshot (`dispatch_scope`, `agreed_nte_amount`) is **immutable** in Phase 5. Surface 23 adds the **config layer that these two columns snapshot *from*** — the two-level architecture becomes a three-level snapshot chain (config → job → dispatch). Surfaces #23/#12/#13/#18.
- **`client_billing_rules` is the waiting AR-config substrate.** Schema-only since Phase 2, comment: *"consumed by billing in Phase 8"* (`client-details.ts:161-162`). Fields: `markup_percent decimal(6,3)`, `payment_terms_days int`, `is_default boolean`, `status` enum. **Note the tension:** it uses an `is_default` flag, **not** the Phase 7 R-7.1 single-active-config discipline — and it is **not** retrofitted to R-7.1 (surfaces #6/#19/#22). **`client_billing_rules` is the client-side billing-config substrate** (it already holds `markup_percent` + `payment_terms_days`). Phase 8 adds **two per-client billing-policy columns** to it — `is_tax_exempt boolean default false` (OQ-7) and `emergency_nte_multiplier decimal(4,2)` nullable (8b-D1 LOCKED Option B) — co-located here because both are per-client billing policy of the same type as the existing fields. It stays on its `is_default` discipline (not R-7.1); **no other prior-phase table is touched** by Phase 8.
- **Dual-write history + event + audit (§2.7, R-5.x).** Every meaningful workflow writes a history/event row, not just a state overwrite. `job_events` is the generic operational timeline: `event_type varchar(64)`, dot-namespaced (`job.created`, `job.dispatched`), `metadata json`, **written inline inside each originating txn** (`job-events.ts`, `jobs.ts:263`, `dispatch.ts:423`) — the model for `job_billing_events` (surface #17).
- **Phase 4 hands Phase 8 the close flow.** `jobs.closed_at` / `completed_at` exist; Phase 4 forward pointer: *"Phase 8 the billing/`closed_at` flow"* (`docs/phase-4-jobs/08-db-changes.md:62`). `job_statuses` is a **global reference table** (category ∈ open/in_progress/on_hold/completed/cancelled, `is_terminal`, `sort_order`). Surface #21.
- **Status & reference-data patterns.** Lifecycle either an **enum** on the record (small/stable, e.g. `jobs.source_type`, `vendor_rates.rate_type`) or a **global/tenant reference table** (`job_statuses`, `dispatch_assignment_statuses`) when operator-configurable with metadata. Surfaces #8/#4 pick per-case.
- **Snapshot-immutability (R-5.x / Phase 5).** Commercial commitments are **snapshotted at commit time, not read live** — `dispatch_scope`, `matched_trade_id`, `agreed_nte_amount` are frozen on the assignment. Phase 8 applies this to markup (#6), NTE resolution/baseline (#23/#18), and proposal/CO scope (#9/#13).
- **Phase 7 config discipline (R-7.1/R-7.3, defaults-table sibling).** Tenant config keeps `tenant_id` NOT NULL; platform defaults live in sibling `*_defaults` tables; resolver falls through tenant → defaults; single-active is a **data-layer write-path invariant** (not a DB unique), enforced by `activate*` functions with F3 named errors. The **new** Phase 8 config table `client_nte_rules` inherits this (surface #23).
- **Single-writer for mutable substrate (R-7.2).** Named canonical writer per mutable substrate; agents/automation have **no path** to it. Phase 8 names writers for line/invoice totals, payment-status, billing-event emission, NTE resolution, and override audit (surfaces #1/#16/#17/#23).
- **Derived-view discipline (D-7.3).** `jobs.approved_scope_of_work` is a **flat render** of the canonical `job_scope_steps`, written **only** by `publishScopeDraft` (R-7.2). Phase 8 must not open a second writer of it (surfaces #9/#13 — load-bearing).
- **Data-layer-boundary enforcement + F3 errors (D-7.7).** Substrate invariants live **inside the data-layer transaction**, not the action wrapper, with typed named errors (`NoActivePromptError`, `DraftNotApproved`, `ScopeAlreadyPublished`…). Phase 8 follows this for every invariant it adds (`NteRuleAlreadyActive`, single-live-revision, payment direction/invoice XOR, NTE-exceedance).
- **Agent substrate (§2.9, Phase 6/7).** `agent_runs`/`agent_tool_calls`/`agent_decisions` + `ai_prompt_templates`/`_defaults` + `agent_policies`/`_defaults` + the resolvers + shared LLM routing — **built and proven, currently inert beyond review-required** (L-7.1). Surface #22 locks it **inert through Phase 8**.
- **Roles (Phase 1 seed).** `super_admin`, `tenant_admin`, `operator`, `accounting` (*"Handles invoices, billing, and financial reporting"*), `vendor_user`, … (`db/seeds/initial.ts:39-63`). **Role-gating is currently deferred platform-wide** (Phase 7 `10-known-limitations.md`: *"Role-gating on generate/approve/publish … → future"*) — i.e. actions today are tenant-member-gated, not role-enforced. Surface #20 locks Phase 8 as the platform's **first enforced role split** (three money-commitment actions).
- **Inherited gotchas.** MariaDB `json()`-as-`longtext` → parse at the read boundary (R-6.19); FK-prefix ≤ 64 chars (R-6.22) — billing table names are long, **expect explicit short FK names** (the Phase 5 `jva_`/`jvash_` precedent); stop `next dev` before DB-touching scripts; `--conditions=react-server` for server-only script imports.

**Two corrections to the brief, surfaced from the repo (do not propagate the brief's framing where the repo already answers):**
1. **Currency is not an open "single vs multi" choice at the shape level** — `vendor_rates.currency varchar(3) default 'USD'` already sets the per-record-column precedent. The MVP choice is only *how much logic* to wire (surface #2).
2. **§9 lists no `change_order_approvals` and no vendor↔client invoice link table.** The brief asks about both; creating either is a **Phase 8 decision under §5.4**, not a roadmap mandate (surfaces #12/#15).

**Forward-flags for later phases (to surface in `10-known-limitations.md` at closeout):**
1. **Phase 11 (client portal):** markup columns on `client_invoices`/lines are **internal-only** — client-portal renders show marked-up totals, never the cost+markup split (OQ-6, surface #6).
2. **Phase 13 (email ingestion):** Phase 13 will need `vendor_invoices.source_type = 'email_ingestion'` to interact with the email-ingestion draft/review model the same way `email_work_order_drafts` does. The `source_type` column is the placeholder; **Phase 13 wires the draft semantics, Phase 8 only ships the column** (surface #5).

---

## §B — Money / numeric substrate

### Surface 1 — Money representation

**(a) What / why now.** Every billing table stores money. The precision/scale, rounding convention, and *where the line→invoice math lives* must be fixed **before** schema (8b), because they propagate to ~8 tables and are painful to change after data exists. The brief asked whether to distinguish three tiers (unit prices vs extended (line) totals vs invoice totals); the 8a review settled this.

**(b) Options.**
- **Uniform `decimal(12,2)` everywhere** — matches the existing NTE/rate convention exactly; zero new precision concepts.
- **Tiered precision** — `unit_price decimal(12,4)`, `quantity decimal(12,3)`, money amounts `decimal(14,2)`. Standard accounting shape: sub-cent on the rate, round at the money. **Rejected** — the business does not price sub-cent per-unit.
- **DB generated/STORED columns** for `extended = qty × unit_price` vs **application-side single writer.**

**(c) Recommendation — LOCKED at 8a review (OQ-1): uniform `decimal(12,2)` for all priced money; round-half-up; single application-side writer.**
- **All monetary amounts `decimal(12,2)`** — `unit_price`, `extended_amount`, `markup_amount`, `subtotal`, `total`. This holds the established platform convention exactly (`jobs.not_to_exceed_amount`, `agreed_nte_amount`, `vendor_rates.amount`); `(12,2)` tops out near $10B — ample for any facilities invoice. The tiered `(12,4)`/`(14,2)` proposal is **dropped**: there is no sub-cent per-unit pricing (OQ-1).
- **`quantity decimal(10,2)`** — supports fractional-hour and fractional-unit billing (e.g. 2.50 hrs) at two decimals; the `(12,3)` tier is dropped with the rest of the tiering.
- **Rounding: round-half-up at the line-extended boundary** (`round(quantity × unit_price, 2)`), then **invoice total = Σ of the rounded line amounts** ("round each line, then sum" — avoids penny drift vs round-of-sum). Round-half-up, not banker's rounding (OQ-1).
- **Math lives in a single application-side writer, not DB generated columns.** Four functions — `recalculateVendorInvoiceTotals`, `recalculateClientInvoiceTotals`, `recalculateProposalTotals`, `recalculateChangeOrderTotals` — recompute line-extended + markup + tax + subtotal + total **inside every mutating transaction** — the **R-7.2 single-writer analog** for money. Stored totals are a *cache of the line math*, never hand-edited. This matches the platform's settled posture (**D-7.7**: invariants at the data-layer write boundary, not DB constraints; R-7.1 deliberately *downgraded* DB constraints in favour of code). DB STORED generated columns are rejected: Drizzle support is thin, rounding mode is DB-dependent, and markup/tax composition in pure SQL fights the single-writer discipline and is harder to test.
- **One exception to uniform `(12,2)`:** the **placeholder tax columns** ship per OQ-7 as `tax_rate decimal(6,3)` / `tax_amount decimal(14,2)` (deliberately generous; unused in Phase 8 — surface #7).

**(d) Prior-phase retrofit consequence — NONE.** Existing `(12,2)`/`(6,3)` columns unchanged; Phase 8 adds `(12,2)` money columns + `quantity decimal(10,2)` on its own tables.

**(e) Resolved — OQ-1 LOCKED at 8a review:** no sub-cent unit pricing → uniform `decimal(12,2)`; `quantity decimal(10,2)`; round-half-up (not banker's rounding).

### Surface 2 — Currency scope

**(a) What / why now.** Whether money columns carry a currency, and at what grain — because retrofitting currency onto money tables after data exists is a breaking migration (the §2.7 "design from day one" case).

**(b) Options.** (A) No currency column, single-currency MVP — but this **breaks the `vendor_rates` precedent** and makes multi-currency a future breaking add. (B) Per-record `currency` column on each billing **header**, default `'USD'`, no FX logic. (C) Per-**line** currency — rejected: currency is a header attribute; mixing currencies within one invoice is out of any plausible MVP.

**(c) Recommendation — LOCKED at 8a review (OQ-2): Option B, matching the `vendor_rates` precedent exactly.** Add **`currency varchar(3) NOT NULL default 'USD'`** to each billing **header** (`vendor_invoices`, `client_invoices`, `proposals`, `change_orders`, `payment_records`, and `client_nte_rules` — #23). **Same-currency MVP**: no FX conversion, no multi-currency rate tables, no per-line currency in Phase 8. The column **is** the non-breaking placeholder; multi-currency logic is the future add. `varchar(3)` (not `char(3)`) for cross-table consistency with `vendor_rates`.

**(d) Prior-phase retrofit consequence — NONE.** Directly reuses the established `vendor_rates` shape.

**(e) Resolved — OQ-2 LOCKED at 8a review:** same-currency MVP; per-record `currency varchar(3) NOT NULL default 'USD'` on every billing header; FX deferred (the column is the non-breaking placeholder).

---

## §C — Record-type architecture

### Surface 3 — Vendor invoices vs client invoices: two tables vs polymorphic

**(a) What / why now.** The single biggest record-architecture call; it shapes line items (#4), payments (#16), events (#17), and portal exposure (Phase 10/11). This is **Phase 7's surface #1 pattern applied to invoices** (shared/polymorphic vs specialized).

**(b) Options.**
- **Single polymorphic `invoices` + `party_type`** — one line-item table, one totals path. Costs: a polymorphic party FK (`vendor_id` XOR `client_id`), every query gains `WHERE party_type=`, a `status` enum that must span **both** lifecycles, and — critically — **portal-exposure risk**: Phase 10 vendor portal and Phase 11 client portal would each query a filtered subset of one table, where a single missed `party_type` filter leaks the *other party's* financial data across a tenant boundary.
- **Two parallel tables** (`vendor_invoices`, `client_invoices`), each with its own line-item child — the roadmap §8/§9 phrasing verbatim.

**(c) Recommendation — TWO parallel tables.** The lifecycles genuinely diverge: vendor invoices are **AP / incoming** (we *record* what a vendor sent: `received → under_review → approved|disputed → paid`); client invoices are **AR / outgoing** (we *author and issue*: `draft → sent → paid`). Source-of-truth direction is opposite, the party FK differs, and the portal tables map **1:1 to a party** (no cross-party leakage surface). This is exactly Phase 7's surface-#1 logic: **specialize when the I/O and lifecycle diverge structurally; the generic reuse is the shared *code*** — the `recalculate*Totals` writer (#1), the line-item *column shape* (#4), and the money helpers — **not a shared table.** Matches roadmap §9 verbatim.

**(d) Prior-phase retrofit consequence — NONE.** New tables; cleaner Phase 10/11 portal mapping.

**(e) Open question — none structural.** The "don't duplicate" pressure moves to the line-item *shape* (#4), where it is resolved by sharing the column definition in code across separate tables.

### Surface 4 — Line-item structure

**(a) What / why now.** Four parents need line items (`vendor_invoices`, `client_invoices`, `proposals`, `change_orders` — §9 lists all four line-item tables). Shape sharing, the category taxonomy's storage, and any link to Phase 7 `job_scope_steps` must be fixed before 8b.

**(b) Options.**
- **Shared shape vs per-type shape.** With four parents, either one polymorphic line-item table (parent_type discriminator — rejected by the #3 logic) or **four separate tables with an identical column shape** defined once in code (the Phase 5 D-5.21 "identical v1 shape, two tables by design" precedent — `vendor_check_ins`/`vendor_check_outs`).
- **Category taxonomy** (labor, materials, equipment, trip, permit, fee, tax, other) as **reference table** vs **enum**. The repo uses both: `vendor_rates.rate_type` is an **enum**; `job_statuses` is a **reference table**.
- **`job_scope_steps` link:** FK on each line item, loose nullable join, or no link.

**(c) Recommendation — LOCKED at 8a review (OQ-3).**
- **Four separate line-item tables, identical column shape shared in code** (`description`, `category`, `quantity`, `unit`, `unit_price`, `extended_amount`, [markup/tax fields per #6/#7], `sort_order`, provenance, timestamps). Separate tables keep the parent FK clean (non-polymorphic, simple cascade) and the per-side portal exposure clean — same reasoning as #3, consistent across the phase.
- **Category as an `enum`** for Phase 8 (the brief's 8-value taxonomy), matching the stable-8-value `source_type` / `rate_type` enum precedent. Documented escape hatch: if tenants need **custom** categories, promote to a reference table later (a known, near-non-breaking migration). *Tax-as-category caveat:* tax is handled as per-line fields (#7), so `tax` as a category only means a *standalone tax line*; keep it in the enum for flexibility, but per-line tax fields are the primary mechanism.
- **No `job_scope_steps` link in Phase 8.** Phase 7 scope steps describe **work** and explicitly **exclude pricing** (the seed prompt: *"Do NOT include: pricing, not-to-exceed amounts…"*); line items are **pricing** at a different granularity (9 scope steps → maybe 3 invoice lines: labor/materials/trip). A 1:1 FK is structurally wrong; a speculative nullable link is §5.4 over-build. The shared anchor is the **job**, which both reference. Scope-to-invoice reconciliation is a Phase 16-class agent concern (#22); add the link **when that reader needs it**.

**(d) Prior-phase retrofit consequence — NONE.**

**(e) Resolved — OQ-3 LOCKED at 8a review:** category as an **enum** (8-value taxonomy, promotion-to-reference-table path documented); **no `job_scope_step` link** in Phase 8 (scope-to-invoice reconciliation deferred).

### Surface 5 — Source-agnosticism for vendor invoices

**(a) What / why now.** §2.1: vendor invoices will arrive via vendor-portal upload, email parsing, external-portal sync, and manual entry. The source field belongs in the schema from day one even if only one value is wired.

**(b) Options.** (A) No source field, add later (breaks §2.1, future breaking migration). (B) `source_type` enum on `vendor_invoices` analogous to `jobs.source_type`.

**(c) Recommendation — LOCKED at 8a review (OQ-4): Option B, a near-verbatim reuse of the `jobs` pattern.** `vendor_invoices.source_type` enum default **`manual`** with values `manual`, `vendor_portal`, `email_ingestion`, `external_portal_sync`, `api`; plus `source_external_id varchar(255)` nullable, **no uniqueness** (mirrors D-4.13 — duplicate detection is the future linking layer's concern). Only `manual` is wired in Phase 8; `email_ingestion` is the Phase-13 placeholder (§A forward-flag). **Client invoices do not get `source_type`** — they are aggregator-*authored* (outgoing), so §2.1's "many input channels" motivation does not apply.

**(d) Prior-phase retrofit consequence — NONE.** Direct application of the established `jobs` source-agnostic pattern.

**(e) Resolved — OQ-4 LOCKED at 8a review:** **no `source_type` on `client_invoices`** (aggregator-authored). `vendor_invoices.source_type` ships per §2.1 with only `manual` wired (Phase-13 wires `email_ingestion`).

---

## §D — Pricing semantics

### Surface 6 — Markup model

**(a) What / why now.** Markup connects vendor **cost** to client **price** and must integrate with the waiting `client_billing_rules.markup_percent`. Grain (per-line vs per-invoice) and the *snapshot-vs-live* question shape the client-invoice + line-item schema.

**(b) Options.** Per-line markup · per-invoice markup · **both (resolution order)**. And: does `client_billing_rules` supply markup **live at read time** or is markup **recorded on the invoice** at creation (snapshot)?

**(c) Recommendation — LOCKED at 8a review (OQ-5/OQ-6): per-line markup primary, per-invoice default columns also present, sourced from `client_billing_rules` as a *snapshot at creation*, internal-only.** Markup is **AR-side only** (it lives on `client_invoices`/their lines; `vendor_invoices` carry **no** markup). Resolution at creation: `client_billing_rules.markup_percent` (the client's `is_default=true`, `status='active'` rule) → per-invoice default → optional **per-line override** (materials marked up, labor passed through is a common real split). **Per-line markup is the primary mechanism; the per-invoice default columns are present** to pre-fill the lines.
- **Snapshot, not live (the load-bearing rule).** `client_billing_rules` can change after an invoice issues; the invoice must preserve **the markup actually applied**. So the rule **supplies a default at creation**; the invoice/line then **records its own copy** and never re-reads the rule. This is the dispatch-snapshot precedent (`agreed_nte_amount`, `dispatch_scope` frozen at commit) applied to markup.
- Math in the **single writer** (#1): `markup_amount = round(extended_amount × markup_percent / 100, 2)`.
- **Markup is internal-only (OQ-6):** client invoices render the **marked-up totals**, never the cost+markup split. **Phase-11 forward-flag (§A):** markup columns are not exposed in client-portal renders.

**(d) Prior-phase retrofit consequence — `client_billing_rules` is read, not reshaped (save the two per-client billing-policy columns it gains — `is_tax_exempt`, OQ-7; `emergency_nte_multiplier`, 8b-D1).** Phase 8 lights up its Phase-2 "consumed by billing" comment. It stays on its `is_default` boolean — **not** converted to R-7.1 (OQ-22). **Deterministic ordering rule (pressure-test catch):** if multiple rows match (`is_default=true`, `status='active'`), the resolver takes the row with the **earliest `created_at`**; ties on `created_at` fall to the **lowest `id`**. (This is the documented deterministic tie-break for the non-single-active `client_billing_rules`; contrast `client_nte_rules`, which is true R-7.1 single-active — #23.)

**(e) Open questions — resolved.**
- **Resolved — OQ-5 LOCKED at 8a review:** **per-line markup primary**; per-invoice default columns **also present**.
- **Resolved — OQ-6 LOCKED at 8a review:** markup is **internal-only**; client invoices render marked-up totals, not the underlying split. Phase-11 portal forward-flag recorded (§A).

### Surface 7 — Tax handling

**(a) What / why now.** Tax is genuinely complex (jurisdiction, rate, nexus, exemption) and squarely in §8's "do not build a full accounting system" zone — but the *columns* are a §2.7 design-from-day-one concern.

**(b) Options.** (A) Full per-line tax + tax-exempt-client logic in Phase 8. (B) **Placeholder columns, logic deferred.** (C) No tax at all (omit columns).

**(c) Recommendation — LOCKED at 8a review (OQ-7): placeholder columns + the `is_tax_exempt` column on the `client_billing_rules` substrate.** Add `tax_rate decimal(6,3)` (nullable) and `tax_amount decimal(14,2)` (default 0) to line items, and `tax_total` on invoice headers; **and add `is_tax_exempt boolean default false` to `client_billing_rules`** — one of the **two** per-client billing-policy columns Phase 8 adds to that substrate (the other is `emergency_nte_multiplier`, 8b-D1; §A). **No** jurisdiction lookup, **no** automatic rate, **no** exemption engine in Phase 8: the single writer (#1) treats `tax_amount` as **operator-entered or 0**, and `is_tax_exempt` is **recorded but not yet enforced**.

**(d) Prior-phase retrofit consequence — `client_billing_rules` is the only prior-phase table Phase 8 touches**, gaining two per-client billing-policy columns (`is_tax_exempt` here + `emergency_nte_multiplier`, 8b-D1). Everything else is new tables.

**(e) Resolved — OQ-7 LOCKED at 8a review:** (i) placeholder tax columns ship (no calculation); (ii) `is_tax_exempt` added to `client_billing_rules` now (recorded, not enforced).

---

## §E-pre — Client NTE configuration *(Surface 23 — added at 8a review)*

### Surface 23 — Client NTE configuration

*Numbered 23 as the latest surface, placed here — after Pricing semantics (§D), before the Proposal substrate (§E) — because NTE configuration is a pricing-config concern that references the markup-snapshot discipline (#6, above) and is the **source layer** the change-order effective-NTE (#13) and exceedance (#18) surfaces depend on.*

**(a) What / why now.** NTEs originate from a **tenant-managed configuration matrix at the client level**, not from operator entry at job creation. The business model is: **client × trade × urgency → default NTE**, resolved at job creation and **snapshotted** onto `jobs.not_to_exceed_amount`, with operator override available at job and dispatch level. **Emergency** urgency carries a multiplier (tenant default **1.5×**, per-client overridable). One known case has **location-specific** NTEs (a particular client × trade × location). This substrate must exist **before** the invoice substrate, because the existing two-NTE-level architecture (`jobs.not_to_exceed_amount`, `job_vendor_assignments.agreed_nte_amount`) is now revealed to be a **snapshot chain whose *source* is this new config layer**.

**(b) Options considered.**
- **Lookup grain:** `(client, trade, urgency)` three-dim vs `(client, trade, urgency, client_location)` four-dim with nullable location.
- **Single-active discipline:** `is_default` boolean (the Phase-2 `client_billing_rules` pattern) vs **R-7.1 single-active** (the Phase-7 discipline).
- **Emergency handling:** separate rule rows per urgency (no multiplier in code) vs **tenant-default multiplier with per-client override** vs global multiplier only.
- **Fallback resolution:** hard error if no match vs **trade fallback to handyman** vs operator-enters-manually.
- **Override audit:** silent overwrite vs a `job_billing_event` for each override at job/dispatch level.
- **Table placement:** sibling to `client_billing_rules` under client config vs top-level billing substrate.

**(c) Recommendation — LOCKED at 8a review (A-group).**
- **(A1) Table: `client_nte_rules`, sibling to `client_billing_rules` under client config.**
- **Shape:** `tenant_id` NN, `client_id` NN, `trade_id` NN, `priority_id` NN, `client_location_id` **nullable** (location-specific override takes precedence; NULL = client-wide rule), `nte_amount decimal(12,2)` NN, `currency varchar(3)` NN default `'USD'`, `status` enum (`active`, `archived`), audit timestamps. `decimal(12,2)` matches the existing NTE columns on `jobs` and `job_vendor_assignments`.
- **(A2) Single-active discipline: R-7.1 single-active** per `(tenant_id, client_id, trade_id, priority_id, client_location_id)` tuple — enforced at the **data-layer write path** (not a DB unique; the nullable `client_location_id` + MariaDB NULL-as-distinct semantics make a DB unique unreliable, exactly the R-7.1 rationale), via **`activateClientNteRule`** + an F3 named error (**`NteRuleAlreadyActive`**). The **new** config substrate inherits the Phase-7 stricter pattern; **`client_billing_rules` is NOT retrofitted** (it stays `is_default`, OQ-22).
- **(A3) Emergency multiplier: tenant default 1.5×, with a per-client override field.** Resolver: `NTE = base rule × (client override OR tenant default)`. The multiplier applies **only when urgency = emergency**. *(8b micro-decision: whether the per-client override lives on the client record or a new `client_billing_overrides` table — see (e).)*
- **(A4) Location: `client_location_id` nullable on the rule.** Resolver fallback order, most-specific first: `(client, trade, urgency, location)` → `(client, trade, urgency, location=NULL)`.
- **(A5) Trade fallback:** if no `(client, trade=X, urgency=Y)` rule exists, fall through to `(client, trade=handyman, urgency=Y)` **within the same client**. If no handyman rule exists for that client either, **operator enters the NTE manually** at job creation. **No tenant-default tier.**
- **(A6) Override audit:** when an operator overrides the resolved NTE at job creation **or** at dispatch, record a `job_billing_event` (`nte.overridden`) capturing the rule-derived value, the override value, the **level** (job vs dispatch), and the actor. Single-writer enforcement at the override write path (#17).
- **Resolution timing:** the NTE resolves **at job creation** and snapshots to `jobs.not_to_exceed_amount`. The config can change afterward; the job's NTE **does not move**. Same snapshot-not-live discipline as markup (#6) and dispatch scope (Phase 5). `resolveClientNteRule` is the named writer of that snapshot (R-7.2).

**(d) Prior-phase retrofit consequence — NONE structural.** `jobs.not_to_exceed_amount` and `job_vendor_assignments.agreed_nte_amount` are **unchanged in shape**; the change is that Phase 8 documents their *source* (the config resolver, not operator entry from scratch). The Phase-4 `jobs.not_to_exceed_amount` column was always intended to receive an NTE; Phase 8 names where it comes from.

**(e) Open questions — none structural after the A-group locks.** One **forward-flag for 8b:** confirm the per-client emergency-multiplier override lives on the **client record** vs a new **`client_billing_overrides`** table; defer that micro-decision to the 8b plan.

**Carry-forwards engaged:** **R-7.1** (single-active config) — inherited by `client_nte_rules`. **R-7.2** (single-writer for mutable substrate) — applies to the override-audit emission and to the resolver's snapshot write. **D-7.7** (data-layer-boundary invariants + F3 errors) — applies to `activateClientNteRule` (`NteRuleAlreadyActive`).

---

## §E — Proposal substrate

### Surface 8 — Proposal lifecycle

**(a) What / why now.** The state set + which transitions are operator / system / client-portal-driven (Phase 11 forward-link) shapes the `proposals` schema and the event taxonomy (#17). §2.7 requires status transitions be historized.

**(b) Options.** Lifecycle as a **reference table** (the `dispatch_assignment_statuses` pattern) vs an **enum** on the proposal. And: a dedicated `proposal_status_history` table vs folding transitions into `job_billing_events`.

**(c) Recommendation — `status` enum on `proposals`, transitions recorded in `job_billing_events`; ship the full state set, wire only operator-driven transitions in Phase 8.**
- **Enum, not a reference table** — the proposal state set is fixed/standard (unlike operator-configurable dispatch statuses). States: `draft, sent, viewed, accepted, declined, expired, superseded, withdrawn`.
- **History via `job_billing_events`, not a new `proposal_status_history` table** — §9 lists no such table; the billing-event substrate (#17) is the home for these (avoids table proliferation while honoring §2.7).
- **Transition drivers (and Phase 8 reachability):**

  | Transition | Driver | Reachable in Phase 8? |
  |---|---|---|
  | `draft → sent` | operator | **yes** |
  | `sent → viewed` | client-portal / system | **no** — forward-declared (Phase 11); no portal exists to set it |
  | `sent → accepted` / `declined` | client-portal (Phase 11) **or** operator-recorded offline | **operator-recorded** (OQ-8 locked) |
  | `sent → expired` | system (a `valid_until` passes) | **operator-manual or computed-on-read** — no cron in Phase 8 (OQ-8 locked) |
  | any non-terminal `→ withdrawn` | operator | **yes** |
  | `→ superseded` | system (a revision is created, #10) | **yes** (via the revision flow) |

  Forward-declared states (`viewed`, portal-driven acceptance, auto-`expired`) are the L-7.x "reserved-unused state" precedent — built into the enum, not reachable until their phase.

**(d) Prior-phase retrofit consequence — NONE.**

**(e) Resolved — OQ-8 LOCKED at 8a review:** operator may **record offline acceptance** in Phase 8 (`sent → accepted` operator-driven); **auto-expiry deferred** — any `valid_until` is operator-manual or computed-on-read, no cron.

### Surface 9 — Proposal-approved scope vs `jobs.approved_scope_of_work` (the load-bearing D-7.3 intersection)

**(a) What / why now.** **The most consequential cross-phase decision in Phase 8.** D-7.3 makes `jobs.approved_scope_of_work` a *derived view* of `job_scope_steps`, written **only** by `publishScopeDraft` (R-7.2 single writer). A proposal also has an "approved scope." Their relationship must be settled before any proposal schema.

**(b) Options (the brief's three).**
- **(a) Proposal carries its own scope snapshot**, independent of the job's working scope.
- **(b) Approving a proposal writes back** to `jobs.approved_scope_of_work` via the derived-view substrate.
- **(c) Both coexist** with explicit reconciliation rules.

**(c) Recommendation — Option (a): the proposal carries its own scope snapshot, independent; accepting a proposal does NOT write the operational scope.** A proposal is a **client-facing priced commercial document** ("we propose to do X for $Y"); `job_scope_steps` / `approved_scope_of_work` is the **operational technician instruction set**. These are different artifacts, audiences, and granularities — the same distinction as line-items vs scope-steps (#4).
- Option **(b) is rejected because it violates R-7.2**: it opens a *second* writer of the approved-scope substrate, the exact failure D-7.3 forecloses. Accepting a proposal must not silently mutate technician work instructions.
- The proposal's scope is **snapshotted at proposal-creation** (optionally *pre-filled from* the current approved scope as a convenience, but **stored independently** — snapshot, not live reference; the #6 markup-snapshot logic). Accepting it changes the **proposal's** state, not `job_scope_steps`.
- Reconciliation (operator decides the operational scope should now match an accepted proposal) is a **separate operator action**, not an automatic write-back — and re-scoping a published job is itself blocked today by **L-7.7** ("no re-scope of a published job"), so Phase 8 cannot quietly do it anyway.

**(d) Prior-phase retrofit consequence — NONE; it *reinforces* R-7.2 / D-7.3.** No new writer of `job_scope_steps`/`approved_scope_of_work`. `publishScopeDraft` remains the sole writer.

**(e) Open questions — resolved.**
- **Resolved — OQ-9 LOCKED at 8a review:** on a proposal-vs-operational-scope mismatch, Phase 8 **surfaces a note**; it does **not** auto-apply (re-scope is L-7.7-blocked anyway).
- **Resolved — OQ-10 LOCKED at 8a review:** proposal scope is a **free-text/JSON snapshot** (commercial document; structured per-step stays the operational scope's job).

### Surface 10 — Proposal revisions

**(a) What / why now.** How a re-quote is modeled, and how `proposal_approvals` behave across revisions — shapes the `proposals` self-reference and the approvals FK.

**(b) Options.** **Superseded-by chain (new record per revision)** vs **in-place edit + a `proposal_revisions` history table** vs **single-version-only** (no revisions; withdraw + new).

**(c) Recommendation — LOCKED at 8a review (OQ-11): superseded-by chain (new record per revision); a sent proposal is immutable.** A revision is a **new `proposals` row** carrying `parent_proposal_id` (chain root), `supersedes_proposal_id` (prior), and `revision_number int`; creating it flips the prior to `superseded`. Only a **`draft`** proposal is editable in place — once **`sent`**, you revise by superseding, never by editing (immutability for auditability). This mirrors the platform's append-only lean: dispatch immutable snapshot, Phase 7 new-draft-per-run (R-6.18), prompt/policy `draft→active→archived` versioning.
- **`proposal_approvals` are revision-specific**: each approval row references the exact `proposal_id` (revision) approved; a superseding revision starts with **no** carried-over approvals (the approval was of *that* version's price/scope).
- **Single live revision per chain** is an **R-7.1-style single-active invariant**, enforced in the data layer: at most one non-terminal (`draft`/`sent`/`viewed`/`accepted`) revision per chain; creating a revision supersedes the prior.

**(d) Prior-phase retrofit consequence — NONE.**

**(e) Resolved — OQ-11 LOCKED at 8a review:** ship `supersedes_proposal_id` + `revision_number` columns; **sent = immutable** (revise-by-supersession only; only `draft` is editable in place); single live revision per chain (R-7.1-style, data-layer-enforced).

### Surface 11 — Proposal-driven job creation (quote-first workflow)

**(a) What / why now.** Whether a proposal can exist **before** a job and *create* the job on acceptance (quote-first), which inverts the normal job→proposal flow and touches §2.6 intake-review.

**(b) Options.** In-scope (proposals can originate jobs) vs **deferred** (proposals are job-attached; §8 "basic proposal record" + AC "proposals can **link** to jobs" — link, not originate).

**(c) Recommendation — LOCKED at 8a review (OQ-12): DEFER quote-first; Phase 8 proposals are job-attached (`job_id NOT NULL`).** Matches roadmap §8 "basic proposal record" and the AC's "link to jobs" wording. Quote-first overlaps §2.6 (don't auto-create active jobs without intake review) and the client portal (Phase 11) — both out of Phase 8.

**(d) Prior-phase retrofit consequence — NONE.** *(Schema note: `job_id NOT NULL` now means quote-first later needs a nullability migration. The Phase 4 D-4.7 precedent — nullable in schema, required by the manual create path — is available but adds ambiguity; NN chosen for clarity now.)*

**(e) Resolved — OQ-12 LOCKED at 8a review:** quote-first **deferred**; `proposals.job_id NOT NULL`.

---

## §F — Change order substrate

### Surface 12 — Change order parent

**(a) What / why now.** What a CO attaches to (proposal / job / both), and whether `change_order_approvals` exists — shapes the `change_orders` FKs. **§9 lists no `change_order_approvals`** (it lists `proposal_approvals` only), so creating one is a Phase 8 decision.

**(b) Options.** CO is a child of **proposal** / **job directly** / **both**. Approvals: a **parallel `change_order_approvals`** table / a **shared polymorphic approvals** substrate / **no table** (status + event only).

**(c) Recommendation — LOCKED at 8a review (OQ-13): CO is a child of the JOB (`job_id NOT NULL`) with an OPTIONAL `proposal_id` (nullable); approvals mirror `proposal_approvals` as a parallel `change_order_approvals` table (specialized, not shared).**
- The **job is the durable operational anchor** — matches Phase 5's forward pointer (*"Phase 8 change orders own edits to a sent dispatch's scope/NTE"*). A CO most naturally means "this job's cost/scope is changing." The **nullable `proposal_id`** covers "this CO revises a specific accepted proposal" without forcing it — i.e. **both supported, job required, proposal optional.**
- **Approvals: parallel `change_order_approvals`, not a shared polymorphic table** — consistent with the #3/#4 "specialize, share the *shape* in code, not the table" decision, and with Phase 7's rejection of polymorphic substrate when lifecycles can diverge. `proposal_approvals` and `change_order_approvals` share an identical column shape (approver, decision, decided_at, notes, [signature placeholder]) defined once in code.

**(d) Prior-phase retrofit consequence — NONE** for schema; Phase 8 *consumes* the immutable Phase 5 dispatch snapshot (it reads `agreed_nte_amount`/`dispatch_scope`, never mutates them).

**(e) Resolved — OQ-13 LOCKED at 8a review:** keep **both** `proposal_approvals` and `change_order_approvals` (parallel tables, identical column shape shared in code).

### Surface 13 — Change order effect on approved scope

**(a) What / why now.** Whether an approved CO mutates `jobs.approved_scope_of_work` / the proposal's scope / the job NTE — the #9 question, for COs, and again load-bearing against R-7.2.

**(b)/(c) Recommendation — LOCKED at 8a review (OQ-14): an approved CO does NOT modify `job_scope_steps` / `jobs.approved_scope_of_work` (R-7.2 preserved) and does NOT edit the proposal (proposals are immutable once sent, #10).** A CO records its scope/price **delta on itself** (its own line items + a scope-delta text/JSON snapshot) and is a **commercial/billing** record, surfaced via `job_billing_events` (`change_order.approved`). If the operator wants the *operational* scope updated, that's a separate re-scope action (L-7.7-blocked today). The **CO-vs-revision boundary**, locked: a **revision** (#10) re-quotes a proposal **before acceptance**; a **change order** is a forward delta **after work is underway**. Large pre-acceptance changes are revisions, not COs.
- **Effective NTE = `jobs.not_to_exceed_amount` + Σ(approved CO amounts), computed-on-read.** The base NTE is the **immutable snapshot from the config resolver (Surface 23)** and **never moves post-creation**; the approved COs **are** the delta record. **No second writer of `jobs.not_to_exceed_amount`** — the write-through alternative (CO approval updating the base) is **rejected**.

**(d) Prior-phase retrofit consequence — NONE; reinforces R-7.2/D-7.3.** `jobs.not_to_exceed_amount` keeps a single writer (`resolveClientNteRule` at job creation, #23); COs never write it.

**(e) Resolved — OQ-14 LOCKED at 8a review:** effective NTE computed-on-read (base + Σ approved COs); base immutable post-creation; no second writer. CO-vs-revision boundary confirmed (pre-acceptance re-quote = revision; mid-job delta = CO).

---

## §G — Multi-invoice semantics

### Surface 14 — Progress invoicing model

**(a) What / why now.** §8 AC **requires** multiple vendor and multiple client invoices per job. The question is whether **progress *semantics*** (sequence / % complete / final flag) are needed, given §8 "do not build a full accounting system."

**(b) Options.** Full progress billing (% complete, milestones, retainage) vs **`sequence_number` + `is_final` only** vs **bare** (multiple invoices, no semantics).

**(c) Recommendation — LOCKED at 8a review (OQ-15): `sequence_number int` + `is_final boolean`; NO % complete, milestones, or retainage.** Multiple-invoices-per-job is already satisfied by the `job_id` FK with no uniqueness. `sequence_number` (operator-meaningful "invoice n of N", allocated at creation) is cheap ordering. `is_final` marks the closing invoice — the signal that *informs* (not drives, #21) job-billing close. Progress %/milestone/retainage is the "full accounting" zone (facilities work is typically T&M or flat, not construction-style progress billing) — deferred.

**(d) Prior-phase retrofit consequence — NONE.**

**(e) Resolved — OQ-15 LOCKED at 8a review:** progress %/milestone/retainage **out of MVP**; `sequence_number` + `is_final` only.

### Surface 15 — Vendor-invoice-to-client-invoice relationship

**(a) What / why now.** Whether a client invoice **rolls up** one+ vendor invoices via a link table, or the two sides are **independent** with reconciliation deferred. **§9 lists no link table**, so creating one is a §5.4 decision.

**(b) Options.** (A) **Independent**, both keyed to `job_id`; per-job margin computed by aggregation; **no link table.** (B) Ship an explicit `client_invoice ↔ vendor_invoice` rollup link table now (even minimally used).

**(c) Recommendation — LOCKED at 8a review (OQ-16): Option A — independent in Phase 8, no link table; per-job margin is the only reconciliation, computed by aggregation.** §8 forbids "advanced margin analytics **unless simple**." A per-job margin (`Σ client invoice totals − Σ vendor invoice totals`, both by `job_id`) is the **simple, permitted** kind and needs no link table. A **line-level rollup** ("this client line aggregates these vendor lines") is the **advanced** part — deferred. A speculative empty link table is rejected under §5.4 (unlike Phase 7's `scope_templates`, §9 gives no mandate for it). Build the link **when** line-level reconciliation / margin-by-line is built (the Phase 16-class concern, #22).

**(d) Prior-phase retrofit consequence — NONE.**

**(e) Resolved — OQ-16 LOCKED at 8a review:** simple **per-job margin** (Σ client − Σ vendor by `job_id`) in Phase 8's billing section; line-level rollup + link table **deferred**.

---

## §H — Payment substrate

### Surface 16 — `payment_records` shape

**(a) What / why now.** Inbound (client→aggregator) + outbound (aggregator→vendor) in one table with `direction`, or split; and whether partial/allocated payments are modeled. **§9 lists a single `payment_records` table** (leans single-table-with-direction).

**(b) Options.** **Single `payment_records` + `direction` enum** vs **split** (`client_payments`/`vendor_payments`). Allocation: one-payment-one-invoice vs allocation-across-invoices.

**(c) Recommendation — LOCKED at 8a review (OQ-17/OQ-18): single `payment_records` with `direction` enum(inbound, outbound), one payment → one invoice; partial payments yes, cross-invoice allocation deferred.**
- **Single table (the opposite call from #3 — and consistently so).** Unlike invoices, a payment's **shape is uniform** (`amount`, `currency`, `paid_at`, `method`, `reference`, `direction`); the AP/AR divergence lives in the *invoices*, not the payments. So the Phase 7 surface-#1 criterion (*specialize when shape/lifecycle diverge; share when uniform*) here points to **one table** — matching §9. `direction='inbound'` sets `client_invoice_id`; `direction='outbound'` sets `vendor_invoice_id` — a small, contained **XOR** FK invariant enforced in the data layer (D-7.7), acceptable because the rest of the row is uniform.
- **Partial payments: yes** — a payment may be less than the invoice total; record the amount. **Multiple** partial payments to one invoice = multiple rows (fine). The invoice's **payment status is derived** (`Σ payments ≥ total ⇒ paid`; `0 < Σ < total ⇒ partially_paid`) — recomputed by the **payment-recording writer** (the #1 single-writer analog), not hand-set.
- **Cross-invoice allocation deferred** — one payment splitting across many invoices needs a `payment_allocations` junction; out of MVP.
- **Scope clarification:** *recording* a payment (manual ledger entry: "client paid invoice X on date Y") is **in-scope** and is **not** the §8-forbidden "payment processor integration." Processor/gateway integration is out; manual payment records are in.

**(d) Prior-phase retrofit consequence — NONE.**

**(e) Open questions — resolved.**
- **Resolved — OQ-17 LOCKED at 8a review:** cross-invoice allocation **deferred**; one-payment-one-invoice MVP.
- **Resolved — OQ-18 LOCKED at 8a review:** manual payment recording **in-scope**; processor/gateway integration **out**.

---

## §I — Audit substrate

### Surface 17 — `job_billing_events`

**(a) What / why now.** The financial audit trail (§2.7). Its taxonomy, single-writer discipline (R-7.2 analog), and relationship to the existing `job_events` must be fixed. **§9 lists `job_billing_events` as a separate table** from `job_events`.

**(b) Options.** **(a) Reuse `job_events`** with `billing.*` event types (no new table) vs **(b) separate `job_billing_events`** (per §9), with typed money/record refs.

**(c) Recommendation — Option (b): a separate `job_billing_events` table, parallel in shape to `job_events`.** Per §9, and because billing events carry **typed financial refs** that don't belong on the generic operational timeline: `amount decimal(12,2)` (nullable), `currency`, and nullable FKs to the billing records (`proposal_id`, `change_order_id`, `vendor_invoice_id`, `client_invoice_id`, `payment_id`). Shape: `id, tenant_id, job_id, event_type varchar(64), actor_user_id, summary varchar(500), amount, currency, <record FKs>, metadata json, created_at` — **append-only, no `updated_at`** (mirrors `job_events`). This is the #3/#4 "specialize when the payload diverges" logic, applied to events.
- **Taxonomy — `varchar(64)`, dot-namespaced** (matching the open `job_events` convention, **not** a closed enum): `proposal.sent`, `proposal.accepted`, `proposal.declined`, `proposal.withdrawn`, `proposal.superseded`, `change_order.created`, `change_order.approved`, `change_order.declined`, `vendor_invoice.received`, `vendor_invoice.approved`, `vendor_invoice.disputed`, `client_invoice.created`, `client_invoice.sent`, `client_invoice.paid`, `payment.recorded`, `nte.exceeded` (#18), `nte.overridden` (#23).
- **Single-writer (R-7.2 analog) = one *enforcement boundary*, distributed callers.** Following the `job_events` pattern (each workflow writes its event **inside its own txn**, no central writer function), Phase 8 names **one helper** — `emitJobBillingEvent(tx, {...})` — that every billing write path calls inside its transaction. The helper is the single place the taxonomy + shape are enforced (D-7.7 data-layer boundary). Not "one writer of the table," but "one enforcement point for the event shape."
- **No double-write.** Billing events live **only** in `job_billing_events`; the job-detail UI **merges** the two timelines for display (operational + financial). Avoids dual-write drift between the tables.

**(d) Prior-phase retrofit consequence — NONE.** `job_events` unchanged; the UI gains a merge-read.

**(e) Resolved — OQ-19 LOCKED at 8a review:** a **unified merged job timeline** (operational `job_events` + financial `job_billing_events`) is built in Phase 8.

### Surface 18 — NTE/DNE exceedance

**(a) What / why now.** Phase 5 stored `agreed_nte_amount` per dispatch (and `jobs.not_to_exceed_amount` per job, now sourced from the config matrix #23). When a vendor invoice exceeds the NTE, where is that flagged/recorded — event, separate record, or both?

**(b) Options.** Billing **event** only · separate **exceedance record** · **both** · and *which NTE governs* (per-dispatch vs job-level).

**(c) Recommendation — LOCKED at 8a review (OQ-20): both, lightweight — a `nte.exceeded` `job_billing_event` (primary audit) + a snapshot on the vendor invoice; no dedicated exceedance table; exceedance FLAGS, it does not hard-block approval.** On recording/approving a vendor invoice, the writer compares `total` to the governing NTE and:
- **snapshots** the baseline on the invoice — `vendor_invoices.nte_baseline_amount decimal(12,2)` (the governing NTE captured at record time) + a derived `exceeds_nte boolean` — so the invoice carries "over by $X" without recomputation;
- **emits** `nte.exceeded` (amount over, which invoice, which baseline) — the audit trail.
- A **dedicated exceedance table is rejected** as over-build; the event + invoice flag cover MVP.
- **Tie to the dispatch:** `vendor_invoices.assignment_id` (nullable FK → `job_vendor_assignments`) lets an invoice bind to the specific dispatch and thus its `agreed_nte_amount`. Nullable because a manual vendor invoice may not map to a dispatch.

**The `exceeds_nte` writer (pressure-test catch).** `vendor_invoices.exceeds_nte` is set by the **same single writer that owns invoice totals** (`recalculateVendorInvoiceTotals`): the comparison happens **after** totals recompute, **in the same transaction**, against the resolved baseline snapshot captured into `nte_baseline_amount` on the invoice.

**Multi-dispatch NTE aggregation (pressure-test catch; spans #18/#20).** When a job has multiple `job_vendor_assignments`, the **per-invoice** NTE check uses `assignment.agreed_nte_amount` via `vendor_invoices.assignment_id`. **Separately**, the **job-level aggregate** check is computed-on-read: `Σ vendor_invoice totals on the job` vs `jobs.not_to_exceed_amount + Σ approved CO amounts` (the effective NTE, OQ-14). Both checks emit `nte.exceeded` **independently** — the dispatch-level check fires **per-invoice**; the job-level check fires when the aggregate **first crosses** the effective NTE.

**(d) Prior-phase retrofit consequence — NONE; consumes (does not mutate) the immutable Phase 5 snapshot** (reads `job_vendor_assignments.agreed_nte_amount`).

**(e) Resolved — OQ-20 LOCKED at 8a review:** per-dispatch `agreed_nte_amount` governs when `vendor_invoices.assignment_id` is set, else job-level `not_to_exceed_amount`; exceedance **flags** (`nte.exceeded` event + `exceeds_nte` boolean), it does **not** hard-block approval.

---

## §J — Authorization / configuration

### Surface 19 — Approval thresholds

**(a) What / why now.** Whether Phase 8 introduces **dollar-gated** approval (vendor invoice over $X → accounting approval). If yes and it needs a config table, the **R-7.1/R-7.3 single-active discipline must be inherited** (the brief's explicit instruction + the carry-forward).

**(b) Options.** (A) **Defer** dollar-gating; role-based approval only (#20) + the NTE-exceedance flag (#18) as the single "needs attention" signal. (B) A new **`billing_policies`** tenant config table inheriting R-7.1 (data-layer single-active, `*_defaults` sibling). (C) Put thresholds on `client_billing_rules` (but it uses `is_default`, not R-7.1).

**(c) Recommendation — LOCKED at 8a review (OQ-21/OQ-22): defer dollar-gated thresholds; the `billing_policies` table is NOT created in Phase 8.** Multi-tier dollar-gated workflows lean toward §8's "full accounting system." The MVP: approval is **role-based** (#20) + the NTE-exceedance flag (#18) — those are the only "needs-attention" signals. **Carry-forward R-7.1/R-7.3 is still honored by the *one* new config table this phase does ship — `client_nte_rules` (Surface 23) — which inherits R-7.1 single-active wholesale.** **The tension to name:** `client_billing_rules` uses `is_default` (with the deterministic-ordering tie-break, #6), *not* single-active — so **new** Phase 8 config (`client_nte_rules`) follows **R-7.1**, while the schema-only `client_billing_rules` is **not** retrofitted (save the single `is_tax_exempt` column, OQ-7).

**(d) Prior-phase retrofit consequence — NONE** beyond the two `client_billing_rules` policy columns (`is_tax_exempt`, OQ-7; `emergency_nte_multiplier`, 8b-D1). No `billing_policies`, no change to the agent-config tables.

**(e) Open questions — resolved.**
- **Resolved — OQ-21 LOCKED at 8a review:** **no dollar-gated approval thresholds** in MVP; `billing_policies` is **not** created. Role gates (#20) + the NTE-exceedance flag (#18) are the only "needs-attention" signals.
- **Resolved — OQ-22 LOCKED at 8a review:** the **new** config substrate `client_nte_rules` follows **R-7.1 single-active**; `client_billing_rules` stays on `is_default` (deterministic tie-break, #6), gaining only the two per-client billing-policy columns (`is_tax_exempt`, OQ-7; `emergency_nte_multiplier`, 8b-D1).

### Surface 20 — Accounting role surfaces

**(a) What / why now.** The `accounting` role exists (Phase 1) but **role-gating is deferred platform-wide today** (Phase 7 limitation). Phase 8 must decide whether it **introduces the first enforced role split** or documents the intended gating against the current "any tenant member" posture.

**(b) Options.** (A) **Enforce** an accounting/operator split in Phase 8 code (the platform's first role enforcement). (B) **Document the matrix only**, leaving enforcement deferred to match the current posture. (C) **Hybrid** — enforce only the highest-stakes money actions, document the rest.

**(c) Recommendation — LOCKED at 8a review (OQ-23/OQ-24): Hybrid (C) — document the full intent matrix; enforce the gate on the THREE money-commitment actions (client-invoice issuance, payment recording, billing close); vendor-invoice approval is operator-gated.** Locked intent matrix:

| Action | Gated to (enforced in Phase 8) |
|---|---|
| Create/edit/send proposal; record acceptance; create/edit change order | operator |
| Approve change order (commercial) | operator |
| Record vendor invoice (capture what arrived) | either |
| Approve vendor invoice (validate amount/work) | operator — operator approves the agreed-upon price |
| Create/edit client invoice | either |
| Send / issue client invoice (money-in commitment) | **accounting — ENFORCED** |
| Record a payment (inbound/outbound ledger) | **accounting — ENFORCED** |
| Mark final / close billing on a job | **accounting — ENFORCED** |

Bold **— ENFORCED** rows are the three money-commitment actions where Phase 8 introduces the platform's **first enforced role gate**. All other rows are **documented intent, unenforced** in Phase 8 (matching the current platform-wide deferred posture — the Phase 7 limitation).

**Rationale.** The AP control point in this business is **bifurcated** — the **operator** approves the vendor-invoice *amount* (the commercial agreement is satisfied: work was done as agreed, the price is valid), and **accounting** approves the *payment* (the cash leaves the company). Phase 8 enforces accounting gating on the three actions where a money-out or money-in commitment is **irrevocable** (client-invoice issuance, payment recording, billing close). **Vendor-invoice approval stays operator-gated — it is the operational, not the financial, control point.**

**(d) Prior-phase retrofit consequence — the platform's first enforced role gate.** Phase 8 introduces role-check infrastructure on top of Phase 1's `roles`/`user_roles`, scoped to the three enforced actions — a deliberate, documented first (the Phase 7 limitation explicitly deferred this).

**(e) Open questions — resolved.**
- **Resolved — OQ-23 LOCKED at 8a review:** **hybrid enforcement** — first enforced role gate on the **three** money-commitment actions; all other matrix rows documented-but-unenforced.
- **Resolved — OQ-24 LOCKED at 8a review:** **operators approve vendor invoices; accounting approves payment** (the bifurcated AP control, matrix above).

---

## §K — Cross-phase integration

### Surface 21 — Job status integration

**(a) What / why now.** Does billing **drive** job status (final invoice paid → `closed_billed`), or run **parallel** to operational status? Phase 4 hands Phase 8 the `closed_at`/billing-close flow; R-5.8 mandates **explicit** workflow transitions.

**(b) Options.** (A) **Billing drives status** — final client invoice paid auto-transitions the job to a closed/`closed_billed` status. (B) **Parallel** — job status is operational; billing milestones *inform* a "ready to close" signal; the close is an **explicit** operator/accounting action.

**(c) Recommendation — LOCKED at 8a review (OQ-25/OQ-26): Option B — billing is parallel; closing is an explicit human action informed by billing; operational close and billing close are distinct, independent terminal states.** Auto-transitioning a job from a payment event is an **implicit** transition (violates R-5.8 explicit-transitions) and a silent state mutation (against the §2.9 spirit). Instead: billing milestones **emit `job_billing_events`** and may **surface** a "all client invoices paid — ready to close" signal; the transition into a closed status is an **explicit operator/accounting action** that writes `jobs.closed_at` + the status change through the established **dual-write** (status_history + job_event + audit).
- **Phase 8 seeds two `job_statuses` rows:** the operational **`closed`** (if not already seeded) and the **new `closed_billed`** — both `category=completed`, `is_terminal=true`. **Operational close and billing close are independent transitions**, each explicit and human-gated (billing close is the accounting-gated action, #20). This honors the Phase-4 close-flow ownership, R-5.8, and §2.9 simultaneously.

**(d) Prior-phase retrofit consequence.** Phase 8 **seeds the new `CLOSED_BILLED` global `job_statuses` row** (operational `CLOSED` already exists — 8b-D3) and **writes `jobs.closed_at`** via the explicit close action — both anticipated by Phase 4's forward pointer. No change to the status *mechanism*.

**(e) Open questions — resolved.**
- **Resolved — OQ-25 LOCKED at 8a review:** **explicit** human close; **no auto-close** on final-invoice-paid.
- **Resolved — OQ-26 LOCKED at 8a review:** a **distinct `closed_billed` terminal state**, separate from the operational `closed`. Operational `CLOSED` already exists in the seed (8b-D3); Phase 8 seeds only the new `CLOSED_BILLED` (`category=completed`, `is_terminal=true`); operational close and billing close are **independent** transitions.

---

## §L — Scope question (last but consequential)

### Surface 22 — Agents in Phase 8

**(a) What / why now.** Invoice-anomaly flagging, scope-to-invoice reconciliation, markup suggestion. In-scope (which **activates L-7.1** — the inert policy resolver — and inherits the Phase 7 prompt/policy/F3 discipline + the Q-7.1 "split seed files when a third agent lands" trigger) vs defer. The brief calls this out as the explicit L-7.1 decision; the Phase 7 closeout flags Phase 8 as the *candidate* activation point.

**(b) Options.** (A) **Defer all agents**; Phase 8 ships the billing substrate only; the policy resolver stays inert. (B) **Activate one agent** — anomaly-flagging (the lowest-coupled, read-only, draft/review-queue candidate). (C) Activate multiple (markup suggestion / scope-to-invoice reconciliation too).

**(c) Recommendation — LOCKED at 8a review (OQ-27): Option A — DEFER all agents; Phase 8 ships the billing substrate with no agent; L-7.1 stays inert through Phase 8.**
- **§5.4 (stay in phase).** Roadmap §8's deliverables **and** acceptance criteria contain **no agent**. Adding one is forward scope creep without explicit roadmap reason.
- **Substrate-first is the platform's own proven cadence.** Phase 6 built the rewriter substrate; Phase 7 generalized agents *onto a substrate that already existed*. Phase 8 is the "build the billing substrate" phase; a future phase activates agents **on** it. Coupling an agent to a substrate that doesn't exist yet inverts the pattern that worked twice.
- **Anomaly flagging needs data that won't exist yet.** "Anomaly" is defined relative to historical invoices; there are none until Phase 8's substrate is *flowing*. Building the flagger in the same phase that creates its first data is premature.
- **L-7.1 says "Phase 8**+**", not "Phase 8."** Keeping the resolver inert through Phase 8 is fully consistent with the carry-forward; the human approval gates (#19/#20) are deliberately *non-agent* controls.

**If a future phase activates:** the bounded candidate is **invoice-anomaly *flagging*** — read-only, produces review-queue flags/`agent_decisions`, **never mutates money**, strictly draft-and-review (§2.9). It would add a third `agent_id` (e.g. `invoice_anomaly_flagger_v1`), seed its prompt + policy into the `*_defaults` tables, and **trigger Q-7.1** (split `db/seeds/agent-config.ts` into per-agent files). Markup suggestion and scope-to-invoice reconciliation are more entangled/data-hungry — defer regardless.

**(d) Prior-phase retrofit consequence — NONE.** The L-7.1 resolver stays inert; Q-7.1 carries forward unchanged.

**(e) Resolved — OQ-27 LOCKED at 8a review:** **defer all agents** in Phase 8; the L-7.1 policy resolver stays **inert**; Q-7.1 (agent-config seed-file split) carries forward unchanged.

---

## §M — Phase 7 carry-forward ledger (how each is discharged or inherited)

| Carry-forward | Disposition in this proposal (post-8a-lock) |
|---|---|
| **L-7.1** — policy resolver wired but inert; Phase 8 the natural activation point | **Stays inert through Phase 8** (OQ-27 locked: defer-all-agents). The human approval gates (#19/#20) are deliberately non-agent. |
| **R-7.1 / R-7.3** — single-active config write-path discipline | **Inherited by the NEW `client_nte_rules`** (Surface 23: `activateClientNteRule` + `NteRuleAlreadyActive`) **and by the single-live-revision invariant on `proposals`** (#10). **`client_billing_rules` is NOT retrofitted to R-7.1** — its `is_default` discipline is preserved (deterministic tie-break, #6); the two added policy columns (`is_tax_exempt`, OQ-7; `emergency_nte_multiplier`, 8b-D1) are the **only** prior-phase schema changes, both on the one `client_billing_rules` substrate. No `billing_policies` table (OQ-21). |
| **R-7.2** — single-writer for new mutable substrate | **Named writers:** the four `recalculate*Totals` (vendor invoice / client invoice / proposal / change order); the **payment-recording writer** (invoice `payment_status` derivation, #16); **`emitJobBillingEvent`** (the event-shape enforcement boundary, #17); **`resolveClientNteRule`** (the NTE snapshot at job creation, #23); the **override-audit writer** (`nte.overridden` events, #23). `publishScopeDraft` **remains sole writer** of the approved-scope substrate (#9/#13). |
| **D-7.3** — `approved_scope_of_work` is a derived view, single-writer | **Load-bearing intersection resolved** (#9): proposals carry an **independent** scope snapshot; accepting a proposal **does not** write the operational scope. Approved COs **do not** mutate it either (#13). No second writer opened. |
| **D-7.7** — invariants at the data-layer write boundary + F3 named errors | **Applied to:** `activateClientNteRule` (F3 `NteRuleAlreadyActive`); the single-live-revision invariant on `proposals`; the payment `direction`/invoice-FK **XOR**; the NTE-exceedance check; totals recompute. All enforced **inside the data-layer txn** with typed named errors. |
| **PO-7.1** — gate rhythm + inbound-reference verification caught 3 errors | **Carried as process**: hold at each 8a→8b→build→UI→docs gate; run an inbound-reference pass on the Phase 8 docs at closeout. (This 8a revision ran that pass — see the end-of-doc note in the commit.) |
| **Q-7.1** — split agent-config seed at the third agent | **Deferred** — no third agent activates in Phase 8 (OQ-27); carries forward unchanged. |

---

## §N — Consolidated open-questions register (asked at 8a, answered at 8a review)

All 27 are now **LOCKED**. The register is retained as the asked-and-answered trail (PO-7.1 / R-6.23 discipline). Architecture/consistency calls were made in the surfaces with rationale; the policy/scope calls below were surfaced and resolved by the operator.

| OQ | Surface | Question → **LOCKED answer** |
|---|---|---|
| **OQ-1** | #1 | Sub-cent unit pricing? → **LOCKED: no — uniform `decimal(12,2)`; `quantity decimal(10,2)`; round-half-up.** |
| **OQ-2** | #2 | Cross-currency vendor vs client invoice? → **LOCKED: same-currency MVP; per-record `currency varchar(3) NN default 'USD'`; FX deferred.** |
| **OQ-3** | #4 | Category enum vs ref table; scope-step link? → **LOCKED: enum category; no `job_scope_step` link.** |
| **OQ-4** | #5 | Client invoices originate externally? → **LOCKED: no — no `source_type` on `client_invoices`.** |
| **OQ-5** | #6 | Markup per-line vs per-invoice? → **LOCKED: per-line primary, per-invoice default columns present.** |
| **OQ-6** | #6 | Markup client-visible? → **LOCKED: internal-only; client invoices render marked-up totals; Phase-11 forward-flag.** |
| **OQ-7** | #7 | Tax in MVP; exempt flag? → **LOCKED: placeholder tax columns; `is_tax_exempt` added to `client_billing_rules` (recorded, not enforced).** |
| **OQ-8** | #8 | Offline acceptance; auto-expiry? → **LOCKED: operator-recorded acceptance in scope; auto-expiry deferred.** |
| **OQ-9** | #9 | Proposal≠operational scope reconciliation? → **LOCKED: surface-a-note, no auto-apply.** |
| **OQ-10** | #9 | Proposal scope shape? → **LOCKED: free-text/JSON snapshot.** |
| **OQ-11** | #10 | Revision chain vs single-version? → **LOCKED: superseded-by chain (ship `supersedes_proposal_id` + `revision_number`); sent = immutable.** |
| **OQ-12** | #11 | Quote-first; `job_id`? → **LOCKED: quote-first deferred; `proposals.job_id NOT NULL`.** |
| **OQ-13** | #12 | CO approval record depth? → **LOCKED: keep `proposal_approvals` AND `change_order_approvals` (parallel, shared shape in code).** |
| **OQ-14** | #13 | Effective-NTE model? → **LOCKED: base + Σ approved COs, computed-on-read; base immutable; no second writer.** |
| **OQ-15** | #14 | Progress/milestone billing? → **LOCKED: out of MVP; `sequence_number` + `is_final` only.** |
| **OQ-16** | #15 | Per-job margin vs Phase 9? → **LOCKED: simple per-job margin in Phase 8; line-level rollup + link table deferred.** |
| **OQ-17** | #16 | Cross-invoice allocation? → **LOCKED: deferred; one-payment-one-invoice.** |
| **OQ-18** | #16 | Manual payment recording? → **LOCKED: in-scope; processor integration out.** |
| **OQ-19** | #17 | Merged vs separate timeline? → **LOCKED: unified merged timeline (`job_events` + `job_billing_events`).** |
| **OQ-20** | #18 | NTE governance + flag vs block? → **LOCKED: per-dispatch when `assignment_id` set, else job-level; flags, no hard-block.** |
| **OQ-21** | #19 | Dollar-gated thresholds? → **LOCKED: none in MVP; no `billing_policies` table.** |
| **OQ-22** | #19 | New config R-7.1; `client_billing_rules`? → **LOCKED: `client_nte_rules` is R-7.1; `client_billing_rules` stays `is_default`, + two policy columns (`is_tax_exempt` + `emergency_nte_multiplier`, 8b-D1).** |
| **OQ-23** | #20 | Enforce role gates vs document-only? → **LOCKED: hybrid — first enforced gate on three money-commitment actions; rest documented.** |
| **OQ-24** | #20 | Who approves vendor invoices? → **LOCKED: operators approve vendor invoices; accounting approves payment.** |
| **OQ-25** | #21 | Auto-close vs explicit close? → **LOCKED: explicit human close; no auto-close.** |
| **OQ-26** | #21 | Distinct billing-closed state? → **LOCKED: distinct `closed_billed` terminal state, separate from operational `closed`. Operational `CLOSED` already exists in the seed; Phase 8 adds `CLOSED_BILLED` only (8b-D3).** |
| **OQ-27** | #22 | Activate an agent vs defer? → **LOCKED: defer all agents; L-7.1 resolver stays inert; Q-7.1 carries forward.** |

---

## §O — Anticipated R-8.x / D-8.x rules (named at closeout, not here)

For the durable decision trail once 8b+ locks them (the R-7.x style):
- *Uniform money precision: `decimal(12,2)` for all priced amounts (`unit_price`, `extended`, `markup`, `subtotal`, `total`), `quantity decimal(10,2)`; round-half-up, sum rounded lines; totals owned by the four `recalculate*Totals` writers* (R-7.2 analog; OQ-1). Tax placeholder columns are the lone exception: `tax_rate decimal(6,3)` / `tax_amount decimal(14,2)`, unused in Phase 8.
- *Per-record `currency varchar(3) default 'USD'` on every billing header; same-currency MVP, FX logic deferred* (reuses the `vendor_rates` precedent).
- *Two parallel invoice tables (AP `vendor_invoices` / AR `client_invoices`); the shared layer is code (totals writer, line shape), not a polymorphic table* (the #3 specialize-vs-share call, consistent with Phase 7 surface #1).
- *Four line-item tables, identical column shape shared in code; category an enum with a documented promotion path; no `job_scope_step` link in MVP.*
- *`vendor_invoices.source_type` mirrors `jobs.source_type` (§2.1); client invoices have none; `email_ingestion` is the Phase-13 placeholder value.*
- *Markup is AR-side, **per-line primary with a per-invoice default**, snapshotted at creation from `client_billing_rules`, **internal-only**; `client_billing_rules` resolves by `is_default=true AND status='active'` with a deterministic tie-break (earliest `created_at`, then lowest `id`).*
- *Tax: placeholder columns only; no calculation/exemption engine in Phase 8; **`client_billing_rules.is_tax_exempt` (recorded, not enforced) is one of the two per-client policy columns Phase 8 adds to `client_billing_rules`** — the other is `emergency_nte_multiplier` (8b-D1).*
- ***Client NTE configuration matrix (`client_nte_rules`, Surface 23) is the source of `jobs.not_to_exceed_amount`:*** *`(client, trade, urgency[, location])` → default NTE, resolved at job creation and snapshotted; emergency multiplier (tenant 1.5× default, per-client override); R-7.1 single-active enforced data-layer (`activateClientNteRule` / `NteRuleAlreadyActive`); trade-fallback to handyman then operator-manual; overrides audited via `nte.overridden`. The two-NTE-level architecture becomes a three-level snapshot chain: config → job → dispatch.*
- *Proposal scope is an independent snapshot; accepting a proposal never writes `job_scope_steps`/`approved_scope_of_work`* (preserves R-7.2 / D-7.3 — the load-bearing rule).
- *Proposals revise by supersession (new record per revision); sent = immutable; approvals are revision-specific; one live revision per chain* (R-7.1-style, data-layer-enforced).
- *Change orders are job-anchored (`job_id NN`) with optional `proposal_id`; an approved CO is a commercial delta that does not mutate operational scope; effective NTE = base + Σ approved COs (computed-on-read, OQ-14 locked); base immutable.*
- *Single `payment_records` with `direction`; one-payment-one-invoice; partial payments yes (status derived); allocation deferred; manual records in-scope, processor out.*
- *`job_billing_events` is a separate substrate from `job_events` (typed money/record refs); `varchar(64)` dot-namespaced taxonomy; one `emitJobBillingEvent` enforcement boundary; **unified merged timeline in Phase 8** (OQ-19).*
- *NTE exceedance = a `nte.exceeded` event + an invoice-level baseline snapshot/flag (`exceeds_nte` set by `recalculateVendorInvoiceTotals`); per-dispatch `agreed_nte_amount` governs when `assignment_id` set, else job-level; a separate job-level aggregate check (Σ vendor totals vs effective NTE) fires independently; no dedicated exceedance table.*
- *Billing is parallel to operational status; closing is an explicit human action writing `closed_at`; **two seeded `job_statuses` — operational `closed` + new `closed_billed`** (both completed/terminal); independent human-gated transitions; no auto-close* (R-5.8, §2.9; Phase 4 close-flow ownership).
- ***Hybrid role enforcement:*** *Phase 8 introduces the platform's first enforced role gate on exactly three money-commitment actions (client-invoice send, payment record, billing close); operator approves vendor invoices, accounting approves payment; all other gating documented-but-unenforced* (OQ-23/24).
- *Any new billing config table inherits R-7.1 single-active + the `*_defaults` pattern; `client_billing_rules` keeps its `is_default` discipline, gaining only the two per-client policy columns (`is_tax_exempt` + `emergency_nte_multiplier`); no `billing_policies` table this phase.*
- *No agent in Phase 8; the L-7.1 resolver stays inert (OQ-27).*

---

## §P — Closing summary

**(a) Record architecture.** **Two parallel invoice tables** (AP/AR), **four line-item tables** with a shared code-level shape, a **single `payment_records`** with `direction`, and a **separate `job_billing_events`** substrate — each call made on the consistent Phase-7 surface-#1 criterion (*specialize when the lifecycle/payload diverges; share the code, not a polymorphic table*; share one table only when the shape is genuinely uniform, as payments are).

**(a′) NTE source layer.** **Surface 23 — the client NTE configuration matrix (`client_nte_rules`) — is added as the source layer for `jobs.not_to_exceed_amount`; the existing two-NTE-level architecture (`jobs` + `job_vendor_assignments`) becomes a three-level snapshot chain: config → job → dispatch.** It is the one new config table this phase ships, and it inherits R-7.1 single-active wholesale.

**(b) The load-bearing D-7.3 intersection (surface #9).** **Resolved Option (a):** proposals (and change orders) carry **independent** scope snapshots; **nothing in Phase 8 opens a second writer** of `job_scope_steps` / `jobs.approved_scope_of_work`. `publishScopeDraft` remains sole writer — R-7.2 and D-7.3 preserved and reinforced.

**(c) Money + carry-forwards.** **Uniform `decimal(12,2)` money** (OQ-1) with the four-function single totals writer (R-7.2 analog); currency reuses the live `vendor_rates` precedent; every invariant lands at the data-layer boundary with F3 errors (D-7.7); the new `client_nte_rules` inherits R-7.1; the `client_billing_rules.is_default`-vs-R-7.1 tension is named, with the two per-client policy columns on `client_billing_rules` (`is_tax_exempt` + `emergency_nte_multiplier`, 8b-D1) as the only prior-phase schema changes.

**(c′) Authorization.** Phase 8 introduces the platform's **first enforced role gate** on **three** money-commitment actions (client-invoice send, payment record, billing close); operator approves vendor invoices, accounting approves payment; everything else is documented intent.

**(d) Agents (surface #22).** **Defer** — substrate-first, data-availability, §5.4. L-7.1 stays inert through Phase 8 (OQ-27).

**(e) What the review settled.** **All 27 open questions (§N) are now LOCKED** at the 8a review, and **Surface 23** was added as the NTE source layer. The register is retained as the asked-and-answered trail. Architecture and consistency calls were **made** with rationale; policy/scope calls were **surfaced and resolved by the operator** — the 7a discipline of being explicit about what could not be pre-decided.

**Approved at 8a review. Committed locally — holding for push + 8b (schema-gate) go-ahead together. Do not open 8b until then.**
