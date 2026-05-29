# Phase 8 — Database Changes

8 migrations (`0016`–`0023`), applied as a single schema gate (8b) before any construction. **13 new tables + 1 retrofit** (2 columns). All schema files under `src/server/schema/`; FK names use short per-table prefixes (R-6.22 — invoice line-item parent FKs would otherwise exceed MySQL's 64-char limit). InnoDB + utf8mb4; `decimal` money; `mysqlEnum` for fixed vocabularies; `json` for metadata (parsed at the read boundary, R-6.19).

## Migration → table map

| Migration | Tables / change |
|---|---|
| `0016_great_kitty_pryde` | **retrofit** `client_billing_rules` +`is_tax_exempt` (bool, recorded not enforced — OQ-7) +`emergency_nte_multiplier` (decimal(4,2), nullable — 8b-D1) |
| `0017_high_wendell_vaughn` | `client_nte_rules` (the NTE source layer) |
| `0018_white_storm` | `proposals`, `proposal_line_items`, `proposal_approvals` |
| `0019_complete_invaders` | `change_orders`, `change_order_line_items`, `change_order_approvals` |
| `0020_lying_sentry` | `vendor_invoices`, `vendor_invoice_line_items` (AP) |
| `0021_light_vindicator` | `client_invoices`, `client_invoice_line_items` (AR) |
| `0022_faulty_turbo` | `payment_records` |
| `0023_brave_stranger` | `job_billing_events` |

Plus a **seed** (not a migration): `CLOSED_BILLED` added to the global `job_statuses` (8b-D3) — a distinct terminal status from operational `CLOSED` (OQ-26).

## Shared line-item shape (`billing-shared.ts`, 8b-D4)

Factory functions (fresh Drizzle builders per table — builders are stateful and bind to the first table they spread into):
- `baseLineItemColumns()` — `id`, `tenant_id`, `line_number`, `category` (8-value enum: labor/materials/equipment/trip/permit/fee/tax/other), `description`, `quantity` decimal(10,2), `unit`, `unit_price` decimal(12,2), `extended_amount` decimal(12,2) (writer-owned), `tax_rate` decimal(6,3)?, `tax_amount` decimal(14,2), timestamps. Spread into **all four** line tables.
- `arMarkupColumns()` — `markup_percent` decimal(6,3)?, `markup_amount` decimal(12,2) (writer-owned). Spread into the **three AR** line tables (proposal / change_order / client_invoice) only. **Vendor (AP) lines carry NO markup** (#6).

## Table notes (the non-obvious shapes)

- **`client_nte_rules`** — `(tenant, client, trade, priority, optional location)` → `nte_amount` decimal(12,2), `currency`, `status` enum `{active, archived}`. Resolve index `(tenant, client, trade, priority)`. Single-active enforced by the writer (R-7.1, no DB unique).
- **`proposals`** — `job_id` NOT NULL (no quote-first, OQ-12); `parent_proposal_id` (revision chain; root = NULL); `revision_number`; `status` enum `{draft, sent, viewed, accepted, declined, expired, superseded, withdrawn}`; `scope_snapshot` text; header totals (subtotal/markup_total/tax_total/total). `proposal_approvals.decision` = `{accepted, declined}`.
- **`change_orders`** — `job_id` NOT NULL; `proposal_id`? (traceability link, set-null); `status` enum `{draft, submitted, approved, declined, withdrawn}` (NO sent, NO superseded — forward deltas); `reason` + `scope_delta_snapshot` text. `change_order_approvals.decision` = `{accepted, declined}` (shared shape → CF-8c.6.1).
- **`vendor_invoices`** (AP) — `vendor_id` (restrict), `assignment_id`? (set-null → `job_vendor_assignments`), `source_type` enum (manual/vendor_portal/email_ingestion/external_portal_sync/api), `source_external_id`? (NO unique), `status` enum `{received, under_review, approved, disputed, paid}`, `payment_status` enum `{unpaid, partially_paid, paid}`, `nte_baseline_amount` decimal(12,2)?, `exceeds_nte` bool, `approved_by_user_id`?/`approved_at`?. No markup.
- **`client_invoices`** (AR) — `client_id` (restrict), **no `source_type`** (aggregator-authored, OQ-4), `status` enum `{draft, sent, void}` (issuance lifecycle), `payment_status` enum (orthogonal — a paid invoice is `status='sent'`), `payment_terms_days` int (snapshot from the default rule at creation), `issued_at`?/`issued_by_user_id`? (the accounting stamp), `markup_total`. **No `notes` column.**
- **`payment_records`** — `direction` enum `{inbound, outbound}` (inbound=AR/client→us; outbound=AP/us→vendor); **both** `client_invoice_id`? and `vendor_invoice_id`? nullable (the XOR is data-layer-enforced, D-7.7 — no DB CHECK); `job_id` NOT NULL (denormalized, **writer-derived** from the invoice, 8b-D5); `amount` decimal(12,2), `method`?, `reference`?, `paid_at` (NOT NULL, no default — writer supplies). FKs to both invoices cascade; `recorded_by_user_id` set-null.
- **`job_billing_events`** — `job_id` (cascade), `event_type` varchar(64) (the 21-type taxonomy, not an enum — grows without migration), `actor_user_id`? (set-null), `summary`, `amount`?/`currency`?, ref columns `proposal_id`?/`change_order_id`?/`vendor_invoice_id`?/`client_invoice_id`?/`payment_id`? (all set-null; 0-to-many per event), `metadata` json. Index `(job_id, created_at)`.

## Verification status

CF-8b.1 substituted a non-destructive drift check (`db:generate` → "no changes") for the full from-scratch rebuild at the 8b gate (the live dev DB carries Phase 4–7 worked data). **The from-scratch `0000`→`0023` byte-identical rebuild against a scratch DB is the `v0.9.0-phase-8` tag blocker** — see `11-closeout.md`.
