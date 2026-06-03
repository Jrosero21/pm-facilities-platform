# Phase 26 — Database Changes

## Migration 0047 — `0047_military_lucky_pierre.sql`

Two new tables: `invoice_drafts` + `invoice_reviews`. **Applied to prod** (Batch 1B): sandbox →
`-E` contract-verify → prod-confirm gate → prod apply. **Table count 119 → 121.** Contract +
FK-matrix verified on both sandbox and prod (identical). `0047` was previously noted as "left free for
the deciding phase" — Phase 26 is that phase; **0047 is now CONSUMED.**

This is the only schema change in the phase. The agent reuses the existing billing tables
(`vendor_invoices` / `vendor_invoice_line_items` as input; `client_invoices` /
`client_invoice_line_items` as the publish output) and the existing agent substrate (`agent_runs` /
`agent_tool_calls` / `agent_decisions`).

## `invoice_drafts`

The agent's output. Written ONLY by the agent at `status='pending_review'`; immutable `proposed_invoice`.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(36) PK | uuidv7 |
| `tenant_id` | varchar(36) NOT NULL | FK → `tenants` **CASCADE** |
| `job_id` | varchar(36) NOT NULL | FK → `jobs` **CASCADE** |
| `agent_run_id` | varchar(36) NOT NULL | FK → `agent_runs` **CASCADE** — the observability/correction join key |
| `vendor_invoice_id` | varchar(36) NOT NULL | FK → `vendor_invoices` **RESTRICT** — the source AP invoice |
| `client_id` | varchar(36) NOT NULL | FK → `clients` **RESTRICT** — the billing target (snapshot) |
| `proposed_invoice` | JSON NOT NULL | the structured draft (immutable); MariaDB `longtext` + `CHECK(json_valid(...))` |
| `status` | enum NOT NULL default `pending_review` | `('pending_review','approved','rejected','discarded','published')` |
| `published_client_invoice_id` | varchar(36) NULL | FK → `client_invoices` **SET NULL** — provenance link on publish |
| `created_at` / `updated_at` | timestamp | DB-managed |

**Indexes:** `invd_tenant_job_idx (tenant_id, job_id)`, `invd_tenant_status_idx (tenant_id, status)`,
`invd_run_idx (agent_run_id)`, `invd_vendor_inv_idx (vendor_invoice_id)` (+ the FK-backing key indexes).
**ENGINE=InnoDB.**

The `client_id` / `vendor_invoice_id` FKs are **RESTRICT** (not cascade) to match the billing-table
convention and preserve the audit trail — a draft must not silently vanish when an upstream client /
vendor-invoice row is deleted. `tenant_id` / `job_id` / `agent_run_id` are **CASCADE** (the
scope-substrate precedent). `published_client_invoice_id` is **SET NULL** (a published client invoice
outlives the draft). There is intentionally **no `published_at`** column — `status='published'` + the
FK carry publish state (the rewriter-style provenance pattern).

### `proposed_invoice` shape

```json
{
  "lineItems": [
    {
      "category": "labor",
      "description": "<client-facing phrasing — LLM>",
      "quantity": "1.00",
      "unit": null,
      "unitPrice": "100.00",
      "markupPercent": null,
      "reconcilesToVendorLineId": "<vendor line id | null for a lump>"
    }
  ],
  "lumpFlag": false,
  "notes": "<optional>"
}
```
Descriptions are LLM phrasing; the dollar fields are vendor-copied (cost) and the markup is the rule
**preview** (re-resolved fresh at publish).

## `invoice_reviews`

The operator's review. Append-only; `edited_content` (nullable) is the operator's edit.

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(36) PK | uuidv7 |
| `tenant_id` | varchar(36) NOT NULL | FK → `tenants` **CASCADE** |
| `draft_id` | varchar(36) NOT NULL | FK → `invoice_drafts` **CASCADE** |
| `reviewer_user_id` | varchar(36) NULL | FK → `users` **SET NULL** |
| `decision` | enum NOT NULL | `('approve','reject')` |
| `edited_content` | JSON NULL | the operator's edited invoice; NULL = approved-as-is; `longtext` + `json_valid` |
| `review_notes` | text NULL | required reason on reject |
| `reviewed_at` | datetime NOT NULL | |
| `created_at` | timestamp | DB-managed; the latest-review-per-draft dedupe key |

**Index:** `invr_draft_idx (draft_id)` (+ FK-backing key indexes). **ENGINE=InnoDB.**

`NULL edited_content` is information-carrying: it is the "approved-as-is" signal that drives both the
Phase-24 approve-as-is reader and the Phase-25 positive/gold split. Because `proposed_invoice` /
`edited_content` are structured JSON, the Phase-25 correction-pairs reader selects them via
`CAST(... AS CHAR)` (the scope path) to hand the raw string to the few-shot layer un-double-encoded.

## Compute-on-read additions (no schema)

- `invoiceCorrectionPairs` (Phase-25 adapter), `invoiceApproveAsIs` (Phase-24 adapter) — readers over
  the two new tables; no column added.
- Volume / cost / dispositions / failures / latency surface for the new agent automatically (GROUP BY
  `agent_id`).

## Carry-forward note

`CF-25.1`'s "why deferred" cited "`0047` left free for the deciding phase" — that rationale is now
**stale** (0047 consumed). CF-25.1 itself (few-shot provenance on `agent_runs`) is untouched and stays
OPEN.
