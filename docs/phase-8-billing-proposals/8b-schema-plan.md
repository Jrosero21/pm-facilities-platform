# Phase 8 — 8b Schema-Gate Plan

**Status:** **approved at 8b review** — locks folded (8b-D1 = Option B; D2–D5 confirmed). Applying via the 8 staged generates (§2/§9), then holding for verify-review. Cadence mirrors Phase 7 8b: plan → review → apply → verify-review.
**Source of truth for substrate decisions:** `8a-design-proposal.md` (committed `f5a3736`, all 27 OQs LOCKED + Surface 23). This plan cites surface (#N) and OQ-numbers for every shape it specifies; it adds nothing the 8a locks didn't settle except the explicitly-deferred items in §4.
**Goal:** enumerate the Phase 8 migrations — dependency-ordered, column-complete — so the apply step is mechanical.

---

## §1 — Pre-flight: current state and inherited conventions

**Migrations on disk:** `0000`–`0015` (16; `db/migrations/meta/_journal.json`). Phase 8 adds **`0016`–`0023`** (8 migrations) + **one seed extension** (no migration). Final count after apply: **24** recorded migrations.

**How migrations are produced (the staged-generate model — Phase 7 precedent).** Drizzle emits **one migration per `db:generate` run**, capturing all schema-file diffs since the last run. Phase 7 produced `0013`/`0014`/`0015` as three migrations by generating in three stages. Phase 8 therefore applies as **8 staged `db:generate` runs**, one per cluster below, in order — each adds that cluster's schema file(s) to `src/server/schema/`, then `pnpm db:generate` (which also runs `fix-mysql-engine.mjs` + `check-migration-identifiers.mjs`, the 64-char FK guard), then `pnpm db:migrate`. **Migration tag suffixes are auto-generated** (e.g. `0016_<adjective_name>.sql`); this plan refers to them by index.

**Inherited conventions (do not redesign — `8a §A`):**
- **Explicit short FK names** on long table names (Phase 5 `jva_`/`jvash_` precedent; R-6.22 ≤64-char guard). Billing names are long → every billing table gets an explicit prefix (defined per-table in §3).
- **Money:** `decimal(12,2)` for all priced amounts; `quantity decimal(10,2)`; tax placeholders `tax_rate decimal(6,3)` / `tax_amount decimal(14,2)`; `currency varchar(3) NOT NULL default 'USD'` (8a #1/#2/#7, OQ-1/2/7).
- **PK:** `varchar(36)` app-generated `uuidv7()`. **Tenant scope:** `tenant_id varchar(36) NOT NULL → tenants` cascade. **User refs:** `→ users` set null. **Soft-delete `status` enum** where the row is operational state; **append-only (no `updated_at`)** for history/event tables (mirrors `job_events`).
- **Config lifecycle** uses its own enum (`agents-config.ts` `configStatusEnum = draft|active|archived`); single-active is a **data-layer write-path invariant, not a DB unique**, when a key column is nullable (R-7.1; the `client_location_id` case).
- **JSON columns** are MariaDB `longtext` + `json_valid` CHECK → parse at the read boundary (R-6.19).

---

## §2 — Migration sequence (FK-dependency-ordered)

Order is driven strictly by FK targets: a table appears only after every table it references. Reference/retrofit first → config → parents → children → cross-referencing audit table last.

| # | Migration (index) | Adds | Depends on | Why here |
|---|---|---|---|---|
| 1 | **0016** — `client_billing_rules` retrofit | `is_tax_exempt` (OQ-7) [+ `emergency_nte_multiplier` pending **8b-D1**, §4] on the existing `client_billing_rules` | existing `clients` only | The one (possibly two) prior-phase column add(s); no new-table deps; smallest first. |
| 2 | **0017** — `client_nte_rules` (Surface 23) | `client_nte_rules` (R-7.1 config substrate) | `tenants`, `clients`, `trades`, `priorities`, `client_locations` (all existing) | NTE source layer must exist before anything reads it; depends only on existing tables. **No `client_nte_rule_defaults`** — see §4 (collides with 8a A5). |
| 3 | **0018** — proposals | `proposals`, `proposal_line_items`, `proposal_approvals` | `tenants`, `jobs`, `users` + self-FK | Parent of change-order's optional link (0019) and a `job_billing_events` ref (0023). |
| 4 | **0019** — change orders | `change_orders`, `change_order_line_items`, `change_order_approvals` | + `proposals` (nullable `proposal_id`, from 0018) | Needs `proposals` to exist for the optional CO→proposal link (#12). |
| 5 | **0020** — vendor invoices (AP) | `vendor_invoices`, `vendor_invoice_line_items` | + `vendors`, `job_vendor_assignments` (nullable `assignment_id`, #18) | Independent of proposals/COs; before `payment_records` + `job_billing_events`. |
| 6 | **0021** — client invoices (AR) | `client_invoices`, `client_invoice_line_items` | + `clients` | Symmetric to 0020; before `payment_records` + `job_billing_events`. |
| 7 | **0022** — payments | `payment_records` | + `vendor_invoices` (0020), `client_invoices` (0021) | The XOR-FK references both invoice tables (#16); must follow both. |
| 8 | **0023** — billing events | `job_billing_events` | + `proposals`, `change_orders`, `vendor_invoices`, `client_invoices`, `payment_records` (all five nullable record FKs, #17) | Last: it carries nullable FKs to every other billing record type. |
| — | **seed** (no migration) | add `CLOSED_BILLED` to `job_statuses` seed (`db/seeds/job-reference.ts`, idempotent on `code`) | `job_statuses` exists (Phase 4) | Data, not schema. `CLOSED` already exists (see §4) → only `CLOSED_BILLED` is new. |

---

## §3 — Per-table column specifications

Honoring the 8a locks. `id` = `varchar(36)` PK `$defaultFn(uuidv7)`; `created_at`/`updated_at` = `timestamp` (`defaultNow()` / `+ onUpdateNow()`) unless stated append-only. All `tenant_id → tenants` cascade. FK delete rules stated per column; **CASCADE** on `tenant_id` and on the parent within a cluster; **RESTRICT** on reference data (vendors/clients/trades/priorities); **SET NULL** on `*_user_id` and on cross-record audit refs.

### 0016 — `client_billing_rules` retrofit (in `client-details.ts`)
ADD COLUMN (both are per-client billing policy — see 8a §A):
- `is_tax_exempt boolean NOT NULL default false` — OQ-7; recorded, not enforced in Phase 8.
- `emergency_nte_multiplier decimal(4,2)` **nullable** — per-client override for the emergency NTE multiplier (**8b-D1 LOCKED: Option B**); NULL → tenant-default resolver constant `1.50`.

No new index. `client_billing_rules` is the client-side billing-config substrate; Phase 8 adds these two policy columns and touches **no other** prior-phase table.

### 0017 — `client_nte_rules` (new file `billing-config.ts`; prefix `cnr_`)
The Surface 23 / A1 shape. **R-7.1 single-active is a write-path invariant — NO DB unique on the resolution tuple** (nullable `client_location_id` + MariaDB NULL-distinct semantics, exactly the `agent_policies` rationale).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | varchar(36) PK | — | uuidv7 |
| `tenant_id` | varchar(36) | NN | → tenants cascade (`cnr_tenant_fk`) |
| `client_id` | varchar(36) | NN | → clients cascade (`cnr_client_fk`) |
| `trade_id` | varchar(36) | NN | → trades **restrict** (`cnr_trade_fk`) |
| `priority_id` | varchar(36) | NN | → priorities **restrict** (`cnr_priority_fk`) — the urgency dimension |
| `client_location_id` | varchar(36) | **nullable** | → client_locations cascade (`cnr_location_fk`); **NULL = client-wide** (A4) |
| `nte_amount` | decimal(12,2) | NN | matches `jobs.not_to_exceed_amount` / `agreed_nte_amount` |
| `currency` | varchar(3) | NN | default `'USD'` |
| `status` | enum(`active`,`archived`) | NN | default `active` (A1; simpler than config draft/active/archived) |
| `created_by_user_id` | varchar(36) | nullable | → users set null (`cnr_created_by_fk`) |
| `created_at`/`updated_at` | timestamp | NN | |

Indexes: `cnr_resolve_idx(tenant_id, client_id, trade_id, priority_id)` (resolution ladder), `cnr_tenant_client_idx(tenant_id, client_id)`. **No unique** (R-7.1 lives in `activateClientNteRule`, §5).

### 0018 — proposals (new file `proposals.ts`; prefixes `prop_` / `pli_` / `papp_`)

**`proposals`** (#8/#9/#10/#11):

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | varchar(36) PK | — | |
| `tenant_id` | varchar(36) | NN | → tenants cascade (`prop_tenant_fk`) |
| `job_id` | varchar(36) | NN | → jobs cascade (`prop_job_fk`) — job-attached, OQ-12; cascade matches job-children convention (jobs soft-delete via `is_archived`) |
| `parent_proposal_id` | varchar(36) | nullable | → proposals set null (`prop_parent_fk`) — chain root (#10) |
| `supersedes_proposal_id` | varchar(36) | nullable | → proposals set null (`prop_supersedes_fk`) — prior revision (#10) |
| `revision_number` | int | NN | default 1 |
| `status` | enum(`draft`,`sent`,`viewed`,`accepted`,`declined`,`expired`,`superseded`,`withdrawn`) | NN | default `draft` (#8; `viewed`/portal-accept forward-declared) |
| `title` | varchar(255) | nullable | |
| `scope_snapshot` | text | nullable | free-text/JSON snapshot (OQ-10), independent of `job_scope_steps` (#9) |
| `currency` | varchar(3) | NN | default `'USD'` |
| `subtotal` | decimal(12,2) | NN | default 0 — computed by `recalculateProposalTotals` |
| `markup_total` | decimal(12,2) | NN | default 0 (AR) |
| `tax_total` | decimal(14,2) | NN | default 0 (placeholder) |
| `total` | decimal(12,2) | NN | default 0 |
| `valid_until` | datetime | nullable | OQ-8 computed-on-read expiry; no cron |
| `notes` | text | nullable | |
| `sent_at` | datetime | nullable | |
| `created_by_user_id` | varchar(36) | nullable | → users set null (`prop_created_by_fk`) |
| `created_at`/`updated_at` | timestamp | NN | |

Indexes: `prop_tenant_job_idx(tenant_id, job_id)`, `prop_tenant_status_idx(tenant_id, status)`, `prop_parent_idx(parent_proposal_id)`.

**`proposal_line_items`** = **base line-item shape + AR-markup extension** (see *Shared line-item shape* below). Parent `proposal_id → proposals` cascade (`pli_proposal_fk`), `pli_tenant_fk`. Index `pli_tenant_proposal_idx(tenant_id, proposal_id)`.

**`proposal_approvals`** (#10, revision-specific):

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` / `tenant_id` | | | (`papp_tenant_fk`) |
| `proposal_id` | varchar(36) | NN | → proposals cascade (`papp_proposal_fk`) — the exact revision approved |
| `decision` | enum(`accepted`,`declined`) | NN | |
| `approver_user_id` | varchar(36) | nullable | → users set null (`papp_user_fk`) — operator who recorded (OQ-8) |
| `approver_name` | varchar(255) | nullable | the client contact who accepted offline (OQ-8) |
| `decided_at` | datetime | NN | |
| `notes` | text | nullable | |
| `signature_ref` | varchar(1024) | nullable | **placeholder** (mirrors `job_attachments.file_url`); no upload wiring |
| `created_at` | timestamp | NN | **append-only** (no `updated_at`) |

Index `papp_tenant_proposal_idx(tenant_id, proposal_id)`.

### 0019 — change orders (new file `change-orders.ts`; prefixes `co_` / `coli_` / `coapp_`)

**`change_orders`** (#12/#13): mirrors `proposals` but **job-anchored with optional `proposal_id`**.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` / `tenant_id` | | | (`co_tenant_fk`) |
| `job_id` | varchar(36) | NN | → jobs cascade (`co_job_fk`) — durable anchor (#12) |
| `proposal_id` | varchar(36) | nullable | → proposals set null (`co_proposal_fk`) — optional link (#12) |
| `status` | enum(`draft`,`submitted`,`approved`,`declined`,`withdrawn`) | NN | default `draft` *(exact tokens — minor, §4)* |
| `scope_delta_snapshot` | text | nullable | the scope/price delta (#13); does **not** mutate `job_scope_steps` |
| `reason` | text | nullable | |
| `currency` | varchar(3) | NN | `'USD'` |
| `subtotal`/`markup_total`/`tax_total`/`total` | decimal | NN | computed by `recalculateChangeOrderTotals` |
| `created_by_user_id` | varchar(36) | nullable | → users set null (`co_created_by_fk`) |
| `created_at`/`updated_at` | | NN | |

Indexes: `co_tenant_job_idx(tenant_id, job_id)`, `co_tenant_status_idx(tenant_id, status)`. **Approved-CO amount feeds the computed-on-read effective NTE (#13, OQ-14) — no write to `jobs.not_to_exceed_amount`.**

**`change_order_line_items`** = base + AR-markup; parent `change_order_id` cascade (`coli_co_fk`, `coli_tenant_fk`).
**`change_order_approvals`** = parallel to `proposal_approvals` (OQ-13), parent `change_order_id` cascade (`coapp_co_fk`, `coapp_tenant_fk`, `coapp_user_fk`).

### 0020 — vendor invoices / AP (new file `vendor-invoices.ts`; prefixes `vinv_` / `vili_`)

**`vendor_invoices`** (#3 AP / #5 / #14 / #18):

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` / `tenant_id` | | | (`vinv_tenant_fk`) |
| `job_id` | varchar(36) | NN | → jobs cascade (`vinv_job_fk`) |
| `vendor_id` | varchar(36) | NN | → vendors **restrict** (`vinv_vendor_fk`) |
| `assignment_id` | varchar(36) | nullable | → job_vendor_assignments set null (`vinv_assignment_fk`) — ties invoice to dispatch's `agreed_nte_amount` (#18) |
| `source_type` | enum(`manual`,`vendor_portal`,`email_ingestion`,`external_portal_sync`,`api`) | NN | default `manual` (§2.1, #5); `email_ingestion` is the Phase-13 placeholder |
| `source_external_id` | varchar(255) | nullable | **no unique** (mirrors D-4.13) |
| `invoice_number` | varchar(128) | nullable | vendor's own number |
| `sequence_number` | int | nullable | per-job ordering (#14) |
| `is_final` | boolean | NN | default false (#14) |
| `status` | enum(`received`,`under_review`,`approved`,`disputed`,`paid`) | NN | default `received` (AP lifecycle, #3) |
| `currency` | varchar(3) | NN | `'USD'` |
| `subtotal` | decimal(12,2) | NN | default 0 — **no markup (AP)** |
| `tax_total` | decimal(14,2) | NN | default 0 (placeholder) |
| `total` | decimal(12,2) | NN | default 0 — computed by `recalculateVendorInvoiceTotals` |
| `nte_baseline_amount` | decimal(12,2) | nullable | governing-NTE snapshot at record time (#18) |
| `exceeds_nte` | boolean | NN | default false — set by `recalculateVendorInvoiceTotals` (#18, pressure-test) |
| `payment_status` | enum(`unpaid`,`partially_paid`,`paid`) | NN | default `unpaid` — **derived** by the payment writer (#16) |
| `invoice_date` | datetime | nullable | |
| `approved_by_user_id` | varchar(36) | nullable | → users set null (`vinv_approved_by_fk`) — **operator** approves amount (#20, OQ-24) |
| `approved_at` | datetime | nullable | |
| `notes` | text | nullable | |
| `created_by_user_id` | varchar(36) | nullable | → users set null (`vinv_created_by_fk`) |
| `created_at`/`updated_at` | | NN | |

Indexes: `vinv_tenant_job_idx`, `vinv_tenant_vendor_idx`, `vinv_tenant_status_idx`.

**`vendor_invoice_line_items`** = **base shape ONLY (no markup — AP, #6)**; parent `vendor_invoice_id` cascade (`vili_invoice_fk`, `vili_tenant_fk`).

### 0021 — client invoices / AR (new file `client-invoices.ts`; prefixes `cinv_` / `cili_`)

**`client_invoices`** (#3 AR / #6 / #14): **no `source_type`** (OQ-4).

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` / `tenant_id` | | | (`cinv_tenant_fk`) |
| `job_id` | varchar(36) | NN | → jobs cascade (`cinv_job_fk`) |
| `client_id` | varchar(36) | NN | → clients **restrict** (`cinv_client_fk`) |
| `invoice_number` | varchar(128) | nullable | our issued number |
| `sequence_number` | int | nullable | per-job ordering (#14) |
| `is_final` | boolean | NN | default false (#14) |
| `status` | enum(`draft`,`sent`,`void`) | NN | default `draft` — **issuance** lifecycle (#3) |
| `payment_status` | enum(`unpaid`,`partially_paid`,`paid`) | NN | default `unpaid` — **derived** (#16) |
| `currency` | varchar(3) | NN | `'USD'` |
| `subtotal` | decimal(12,2) | NN | default 0 |
| `markup_total` | decimal(12,2) | NN | default 0 — **internal-only** (OQ-6); not rendered in Phase-11 portal |
| `tax_total` | decimal(14,2) | NN | default 0 |
| `total` | decimal(12,2) | NN | default 0 — computed by `recalculateClientInvoiceTotals` |
| `payment_terms_days` | int | nullable | **snapshot** from `client_billing_rules` at creation (#6 discipline) |
| `issued_at` | datetime | nullable | |
| `due_at` | datetime | nullable | |
| `issued_by_user_id` | varchar(36) | nullable | → users set null (`cinv_issued_by_fk`) — **accounting** issues (#20 ENFORCED) |
| `created_by_user_id` | varchar(36) | nullable | → users set null (`cinv_created_by_fk`) |
| `created_at`/`updated_at` | | NN | |

Indexes: `cinv_tenant_job_idx`, `cinv_tenant_client_idx`, `cinv_tenant_status_idx`.

**`client_invoice_line_items`** = **base + AR-markup**; parent `client_invoice_id` cascade (`cili_invoice_fk`, `cili_tenant_fk`). **Markup columns internal-only** (OQ-6).

### 0022 — payments (new file `payments.ts`; prefix `pay_`)

**`payment_records`** (#16): single table, `direction`, one-payment-one-invoice; XOR FK in the data layer.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` / `tenant_id` | | | (`pay_tenant_fk`) |
| `direction` | enum(`inbound`,`outbound`) | NN | inbound=client→aggregator, outbound=aggregator→vendor |
| `client_invoice_id` | varchar(36) | nullable | → client_invoices cascade (`pay_client_invoice_fk`) — set iff `inbound` |
| `vendor_invoice_id` | varchar(36) | nullable | → vendor_invoices cascade (`pay_vendor_invoice_fk`) — set iff `outbound` |
| `job_id` | varchar(36) | NN | → jobs cascade (`pay_job_fk`) — denormalized from the invoice at creation (§4) for the job billing section + event linkage |
| `amount` | decimal(12,2) | NN | partial allowed (#16); invoice `payment_status` derived from Σ |
| `currency` | varchar(3) | NN | `'USD'` |
| `method` | varchar(64) | nullable | check / ACH / wire / card |
| `reference` | varchar(255) | nullable | check #, txn id |
| `paid_at` | datetime | NN | |
| `recorded_by_user_id` | varchar(36) | nullable | → users set null (`pay_recorded_by_fk`) — **accounting** records (#20 ENFORCED) |
| `notes` | text | nullable | |
| `created_at`/`updated_at` | | NN | |

Indexes: `pay_tenant_job_idx`, `pay_client_invoice_idx`, `pay_vendor_invoice_idx`, `pay_tenant_direction_idx`. **XOR invariant (exactly one invoice FK set, matching `direction`) is data-layer (D-7.7), §5.**

### 0023 — billing events (new file `billing-events.ts`; prefix `jbe_`)

**`job_billing_events`** (#17): mirrors `job_events` + typed money/record refs; **append-only (no `updated_at`)**.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` / `tenant_id` | | | (`jbe_tenant_fk`) |
| `job_id` | varchar(36) | NN | → jobs cascade (`jbe_job_fk`) |
| `event_type` | varchar(64) | NN | dot-namespaced (taxonomy in #17, incl. `nte.exceeded` #18, `nte.overridden` #23) |
| `actor_user_id` | varchar(36) | nullable | → users set null (`jbe_actor_fk`) |
| `summary` | varchar(500) | NN | |
| `amount` | decimal(12,2) | nullable | |
| `currency` | varchar(3) | nullable | |
| `proposal_id` | varchar(36) | nullable | → proposals set null (`jbe_proposal_fk`) |
| `change_order_id` | varchar(36) | nullable | → change_orders set null (`jbe_co_fk`) |
| `vendor_invoice_id` | varchar(36) | nullable | → vendor_invoices set null (`jbe_vendor_invoice_fk`) |
| `client_invoice_id` | varchar(36) | nullable | → client_invoices set null (`jbe_client_invoice_fk`) |
| `payment_id` | varchar(36) | nullable | → payment_records set null (`jbe_payment_fk`) |
| `metadata` | json | nullable | parse at read (R-6.19) |
| `created_at` | timestamp | NN | append-only |

Indexes: `jbe_job_created_idx(job_id, created_at)` (timeline), `jbe_tenant_job_idx(tenant_id, job_id)`, `jbe_tenant_type_idx(tenant_id, event_type)`. Cross-record FKs are **set null** (audit survives record retirement). Written **only** via `emitJobBillingEvent` (#17, §5).

### Shared line-item shape (defined once in code — `billing-shared.ts`)
- **`baseLineItemColumns`** (spread into all four line-item tables): `id`, `tenant_id` (NN→tenants cascade), `line_number int NN`, `category enum(labor,materials,equipment,trip,permit,fee,tax,other) NN`, `description text NN`, `quantity decimal(10,2) NN default 1`, `unit varchar(32)` nullable, `unit_price decimal(12,2) NN`, `extended_amount decimal(12,2) NN default 0` (writer-owned), `tax_rate decimal(6,3)` nullable, `tax_amount decimal(14,2) NN default 0`, timestamps. *(Parent FK + its short name are added per table, not in the shared spread — Drizzle can't name an FK to a not-yet-known parent generically.)*
- **`arMarkupColumns`** (added to `proposal_line_items`, `change_order_line_items`, `client_invoice_line_items` only): `markup_percent decimal(6,3)` nullable, `markup_amount decimal(12,2) NN default 0`. **Not** on `vendor_invoice_line_items` (#6 — AP carries no markup).
- This is a **shared-base + AR-extension**, a refinement of 8a #4's "identical shape" — flagged in §4.

---

## §4 — Decisions deferred to 8b (surfaced, not papered over)

**8b-D1 — LOCKED at 8b review: Option B.** Home of the emergency NTE multiplier (the Surface 23(e) forward-flag). A3 locked: tenant default `1.5×`, per-client override; this settles *where* each lives.
- **Option A — per-client override on `clients`** (new nullable column); tenant default = resolver constant `1.50`. Lightest, but a second prior-phase table touch (`clients`).
- **Option B (LOCKED) — per-client override on `client_billing_rules`** (`emergency_nte_multiplier decimal(4,2)` nullable, rides 0016); tenant default = resolver constant `1.50` (NULL → 1.50); read from the resolved `is_default` rule (#6 deterministic tie-break).
- **Option C — new `client_billing_overrides` table** (rejected: §5.4 over-build for one scalar). **Option D — configurable tenant-default column on `tenants`** (rejected: more prior-phase touches).
- **Rationale (LOCKED):** `client_billing_rules` *is* the client-side billing-config substrate — `markup_percent` and `payment_terms_days` already live there. The emergency multiplier is a per-client billing **policy**, so it co-locates with the substrate of the same type ("co-locate with the substrate of the same type" supersedes the column-count framing). This is **not** a deviation/exception: 8a §A is **refined** (rev note + bullet) to describe `client_billing_rules` as carrying **two** per-client policy columns (`is_tax_exempt` + `emergency_nte_multiplier`), with **no other prior-phase table touched**. The tenant default stays a resolver constant (`1.50`), promotable to stored per-tenant config later (§8 forward-flag).

**8b-D2 — LOCKED: `client_nte_rule_defaults` is NOT created.** The brief's cluster (b) suggested it, but 8a **A5 locked "No tenant-default tier"** — the fallback is `(client,trade,urgency,location)` → client-wide → **handyman trade** → operator-manual, none of which is a platform/tenant default *row*. Unlike the agent-config substrate (whose `*_defaults` siblings are real platform defaults), `client_nte_rules` has **no defaults sibling**. Dropping it; flagged because it contradicts the brief's suggestion.

**8b-D3 — LOCKED: `CLOSED` already exists; only `CLOSED_BILLED` is seeded.** Live `job_statuses` already has `CLOSED` (category `completed`, terminal, sortOrder 8) **and** `COMPLETED` (sortOrder 6). 8a OQ-26 said "seed both (operational `closed` + new `closed_billed`)" — but `closed` pre-exists. **Refinement:** the seed adds **only `CLOSED_BILLED`** (code `CLOSED_BILLED`, category `completed`, `is_terminal=true`, sortOrder 9). The 8a "distinct billing-close state, separate from operational close" intent holds — `CLOSED_BILLED` is distinct from the existing `CLOSED`.

**8b-D4 — LOCKED: shared-base + AR-markup line-item shape** (not a single identical shape). 8a #4 said "identical column shape"; #6 said vendor invoices carry no markup. Reconciled as `baseLineItemColumns` (all four) + `arMarkupColumns` (the three AR tables — `proposal_line_items`, `change_order_line_items`, `client_invoice_line_items`; **not** `vendor_invoice_line_items`). Refinement of #4 — **record in `02-decisions.md` at closeout.**

**8b-D5 — LOCKED: minor shape calls** (none change substrate semantics):
- proposals self-FK `onDelete` = **set null** (chain pointers are historical hints; single-live-revision is data-layer-enforced regardless).
- `change_orders.status` = **`draft, submitted, approved, declined, withdrawn`** — **no `superseded`** (COs stack as forward deltas, not revisions). The vocabulary difference vs proposals (`sent`/`superseded`) is **recorded in `02-decisions.md` at closeout**.
- `proposals.scope_snapshot` / `change_orders.scope_delta_snapshot` = **`text` only** in Phase 8 (holds free text or a JSON blob — OQ-10). If JSON authoring lands later, add a **format-discriminator column then** — **document the future capability in `10-known-limitations.md` at closeout**.
- `payment_records.job_id` = **denormalized NN, writer-derived from the invoice** at creation. The payment-recording writer reads `job_id` off the resolved invoice and writes the copy; it **never accepts `job_id` as a caller parameter** (a caller-passed value would open a divergence path). **Code-layer rule for 8c (§6).**

---

## §5 — Single-active / single-writer enforcement strategy (data-layer, named — code is 8c)

Per **D-7.7** (invariants at the data-layer write boundary, not the action wrapper) + **R-7.1/R-7.2**. These are **planned signatures**; implementation is 8c.

- **`client_nte_rules` single-active (R-7.1).** `activateClientNteRule(tx, {tenant, client, trade, priority, location|null, nte_amount, currency})`: in one txn, archive the current `active` row for the resolution tuple (no `LIMIT`; assert demoted ≤ 1 → **`NteRuleAlreadyActive`** F3 error on >1), then insert/activate the target. **No DB unique** backs this (nullable `client_location_id`) — 100% write-path, exactly the `agents-config.ts` `agent_policies` precedent. `resolveClientNteRule(tenant, client, trade, priority, location?)` applies the A4/A5 ladder and is the **single writer** of the `jobs.not_to_exceed_amount` snapshot at job creation (R-7.2).
- **Proposals single-live-revision (R-7.1-style, #10).** `createProposalRevision` asserts at most one non-terminal (`draft`/`sent`/`viewed`/`accepted`) row per chain (`parent_proposal_id`), supersedes the prior in the same txn. **No DB unique** (would need a partial unique on status) → write-path.
- **Totals (R-7.2 single-writer for money).** Four functions — `recalculate{Vendor,Client}InvoiceTotals`, `recalculateProposalTotals`, `recalculateChangeOrderTotals` — own line `extended_amount` + header `subtotal/markup_total/tax_total/total`, round-half-up per line then sum (#1). Stored totals are a cache; never hand-set.
- **`exceeds_nte` / `nte_baseline_amount` (#18).** Set inside `recalculateVendorInvoiceTotals`, after totals, same txn, against the resolved baseline (per-dispatch `agreed_nte_amount` when `assignment_id` set, else job-level; OQ-20). The job-level aggregate check (Σ vendor totals vs effective NTE = base + Σ approved COs) is computed-on-read and emits `nte.exceeded` independently.
- **Payment XOR + derived payment_status (#16).** The payment-recording writer asserts exactly one of `client_invoice_id`/`vendor_invoice_id` set, matching `direction` (D-7.7 named error), then recomputes the target invoice's `payment_status` from Σ payments.
- **Billing-event emission (R-7.2 analog, #17).** `emitJobBillingEvent(tx, {...})` is the **one enforcement boundary** for `job_billing_events` shape/taxonomy; every billing write path calls it inside its txn (distributed callers, one helper — the `job_events` pattern). `nte.overridden` emitted by the NTE-override write path (#23 A6).

---

## §6 — 8a locks that schema cannot express (code-layer, flagged)

These ship as **code/behavior**, not DDL — listed so 8c owns them and verification targets them:
- R-7.1 single-active on `client_nte_rules`; single-live-revision on `proposals` (no DB unique — §5).
- Payment `direction`↔invoice-FK **XOR** (no clean conditional DB constraint — §5).
- Money **round-half-up**, round-per-line-then-sum (#1); totals as writer-owned cache.
- **Effective NTE = base + Σ approved COs, computed-on-read** (#13/OQ-14) — **no stored column**; `jobs.not_to_exceed_amount` stays the immutable creation snapshot.
- **Markup/payment-terms snapshot** at creation from `client_billing_rules` (#6); **NTE snapshot** at job creation (#23) — copied, not live-read.
- **`client_billing_rules` is_default deterministic tie-break** (earliest `created_at`, then lowest `id`) — resolver `ORDER BY`, not a constraint (#6).
- **Role enforcement on the three money-commitment actions** (client-invoice send, payment record, billing close) — action-layer auth on `roles`/`user_roles` (#20, OQ-23) — the platform's first enforced role gate.
- **Markup internal-only** (OQ-6) — a render concern (Phase-11 portal omits it), not a column property.
- **`emergency_nte_multiplier` applies only when `priority.code='EMERGENCY'`**, tenant-default constant `1.50` (#23 A3) — resolver logic.
- **`payment_records.job_id` is writer-derived from the invoice, never caller-passed** (8b-D5) — the payment-recording writer reads `job_id` off the resolved invoice and writes the denormalized copy; accepting it as a parameter would open a divergence path.

---

## §7 — Verification queries (run AFTER apply; this turn writes none)

1. **Migration count:** `SELECT COUNT(*) FROM __drizzle_migrations;` → **24**.
2. **`SHOW CREATE TABLE`** for each of the **13 new tables** (`client_nte_rules`, `proposals`, `proposal_line_items`, `proposal_approvals`, `change_orders`, `change_order_line_items`, `change_order_approvals`, `vendor_invoices`, `vendor_invoice_line_items`, `client_invoices`, `client_invoice_line_items`, `payment_records`, `job_billing_events`) — confirm column types (`decimal(12,2)` / `decimal(10,2)` / `varchar(3)`), FK delete rules, `json_valid` CHECK on json columns, and **no unique** on the `client_nte_rules` resolution tuple.
3. **Retrofit:** `SHOW COLUMNS FROM client_billing_rules LIKE 'is_tax_exempt';` (+ `emergency_nte_multiplier` if 8b-D1 = B) — confirm present, correct default.
4. **Seed:** `SELECT code, category, is_terminal, sort_order FROM job_statuses WHERE code IN ('CLOSED','CLOSED_BILLED');` → `CLOSED` pre-existing + `CLOSED_BILLED` new (both `completed`/terminal).
5. **Fresh-migration reproducibility** (the Phase-7 "byte-identical from-scratch" check): on a scratch DB, run `0000`→`0023` clean; confirm no diff vs the incrementally-migrated schema.
6. **FK ≤64-char guard:** `check-migration-identifiers.mjs` runs inside every `db:generate`; confirm clean (it gates generation).
7. **Connection-cap discipline:** stop `next dev` before `db:migrate` / verify scripts (`ER_TOO_MANY_USER_CONNECTIONS`); verify scripts use `--conditions=react-server` for server-only imports.

---

## §8 — Forward-carried flags (into `10-known-limitations.md` at closeout)
- **Phase 11 (client portal):** `client_invoice(_line_items)` markup columns are **internal-only** — portal renders marked-up totals, never the cost+markup split (OQ-6).
- **Phase 13 (email ingestion):** `vendor_invoices.source_type='email_ingestion'` ships now as a placeholder; Phase 13 wires the email-to-invoice draft/review semantics (#5).
- **Phase 16-class:** `job_scope_steps`↔line-item link and vendor↔client line-level rollup are deferred (no link tables); add when the reconciliation reader needs them (#4/#15).
- **Tax engine:** placeholder columns only; jurisdiction/rate/exemption calculation deferred; `is_tax_exempt` recorded, unenforced (#7).
- **Emergency multiplier tenant default** is a resolver constant in Phase 8; promote to stored per-tenant config if a tenant needs a non-`1.50` house default (8b-D1).
- **`billing_policies` (dollar-gated thresholds) not created** (OQ-21); the L-7.1 agent resolver stays inert (OQ-27, Q-7.1 carries forward).

---

## §9 — Schema-file plan (`src/server/schema/*.ts`) + staged generates
- **0016:** edit `client-details.ts` (add `is_tax_exempt` [+ `emergency_nte_multiplier` if 8b-D1=B]) → generate.
- **0017:** new `billing-config.ts` (`client_nte_rules`) → generate.
- **0018:** new `proposals.ts` + new `billing-shared.ts` (the shared column helpers) → generate.
- **0019:** new `change-orders.ts` → generate.
- **0020:** new `vendor-invoices.ts` → generate.
- **0021:** new `client-invoices.ts` → generate.
- **0022:** new `payments.ts` → generate.
- **0023:** new `billing-events.ts` → generate.
- Each new file is exported from the schema barrel (`src/server/schema/index.ts`). Seed: extend `db/seeds/job-reference.ts` with `CLOSED_BILLED` (idempotent on `code`), run `pnpm db:seed:job-reference`.

---

## §10 — Out of scope for 8b (this gate)
- **No migration SQL written, no `db:generate`, no `db:push`, no DB touched** this turn — plan only.
- **No data-layer code** (`activateClientNteRule`, `recalculate*Totals`, `emitJobBillingEvent`, resolvers, the XOR/role guards) — that is **8c**.
- **No UI, no server actions, no agent** (OQ-27 defer).
- The **8b-D1** multiplier-home pick and the **8b-D5** minor shape calls are settled at the **8b review / generate step**, not now.

**Held for review. On go-ahead, apply via the 8 staged generates in §2/§9, then hold for verify-review (§7). Do not write migration SQL or run `db:generate` until then.**
