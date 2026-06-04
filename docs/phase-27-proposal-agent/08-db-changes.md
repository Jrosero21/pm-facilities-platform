# Phase 27 — Database Changes

Migration **0048** (`0048_glorious_iron_patriot.sql`). Tip before: `0047_military_lucky_pierre`; next
free after: **0049**. Prod table count **121 → 123**. Applied via the standard cadence (sandbox apply →
`-E` contract-verify → prod-confirm gate → prod apply).

## ALTER `proposals`

- **`kind` enum('client','internal') NOT NULL DEFAULT 'client'`** — the flavor axis. The default
  preserves all 121 pre-27 rows as client-facing, untouched.
- **`status` gains `internal_billed`** (appended; the 8 existing client-facing values
  `draft,sent,viewed,accepted,declined,expired,superseded,withdrawn` are unchanged). It is the terminal
  state of an approved internal proposal.
- **New composite index `prop_tenant_kind_status_idx (tenant_id, kind, status)`** — covers the
  kind-gated readers (the client-visibility seal, the close-readiness `open_proposals` count,
  `listProposalsForJob`). The older `prop_tenant_status_idx (tenant_id, status)` is **retained**
  (status-only readers still use it).
- Post-migration `proposals` = **21 columns, 4 indexes, 5 FKs**.

## CREATE `proposal_drafts`

The proposal_creator draft I/O — the proposal equivalent of `invoice_drafts`, mirroring its shape.

| column | notes |
|---|---|
| `id` varchar(36) PK | uuidv7 |
| `tenant_id` varchar(36) NN | FK → tenants **CASCADE** |
| `job_id` varchar(36) NN | FK → jobs **CASCADE** |
| `agent_run_id` varchar(36) NN | FK → agent_runs **CASCADE** |
| `proposed_proposal` json NN | **NUMBER-FREE** — `{ lineItems:[{category,description,scopePhrasing}], notes? }`; immutable audit of what the AI produced. No client_id, no quantity/unit_price/markup field. |
| `status` enum | `pending_review, approved, rejected, discarded, published` (mirrors `invoice_drafts` 1:1) |
| `published_proposal_id` varchar(36) NULL | FK → proposals **SET NULL** — the idempotency-guard target / provenance link |
| `created_at` / `updated_at` timestamp | |

- **No `client_id`** (unlike `invoice_drafts`) — job→client is canonical via `proposals.job_id`.
- Indexes: `prpd_tenant_job_idx (tenant_id, job_id)`, `prpd_tenant_status_idx (tenant_id, status)`,
  `prpd_run_idx (agent_run_id)`. (No vendor-invoice lookup — the proposal has no AP source.)

## CREATE `proposal_reviews`

The operator's review of a draft — the proposal equivalent of `invoice_reviews`.

| column | notes |
|---|---|
| `id` varchar(36) PK | |
| `tenant_id` varchar(36) NN | FK → tenants **CASCADE** |
| `proposal_draft_id` varchar(36) NN | FK → proposal_drafts **CASCADE** |
| `reviewer_user_id` varchar(36) NULL | FK → users **SET NULL** |
| `decision` enum('approve','reject') NN | |
| `edited_content` json NULL | **where the dollars first appear** — the operator-authored priced proposal; NULL = unchanged. Effective published = `edited_content ?? proposed_proposal`. |
| `review_notes` text NULL | |
| `reviewed_at` datetime NN | |
| `created_at` timestamp NN | **canonical latest-review-per-draft ordering** (shared `latestReviewPerDraft`) |

- Index: `prpr_draft_idx (proposal_draft_id)`.
- JSON columns (`proposed_proposal`, `edited_content`) land as MariaDB `longtext` + `json_valid` CHECK
  (read back as strings — parse at the boundary, or `CAST(... AS CHAR)` for the raw string).

## FK on-delete matrix (7 FKs — parity with the invoice pair)

| table | column | references | ON DELETE |
|---|---|---|---|
| proposal_drafts | tenant_id | tenants | CASCADE |
| proposal_drafts | job_id | jobs | CASCADE |
| proposal_drafts | agent_run_id | agent_runs | CASCADE |
| proposal_drafts | published_proposal_id | proposals | **SET NULL** |
| proposal_reviews | tenant_id | tenants | CASCADE |
| proposal_reviews | proposal_draft_id | proposal_drafts | CASCADE |
| proposal_reviews | reviewer_user_id | users | **SET NULL** |

## Teardown caveat (harness)

Under `FK_CHECKS=0` (the harness teardown) `ON DELETE CASCADE` does **NOT** fire — children must be
deleted **explicitly by tracked id**: `proposal_reviews → proposal_drafts → proposal_line_items →
proposals → job_billing_events → audit_logs → agent_decisions → agent_tool_calls → agent_runs → …`.
Because the proposal publish **materializes** canonical `proposals` + line items + a billing event +
audit rows (the invoice harness never published, so it never hit these), the proposal teardown is
larger than the invoice teardown. Never delete by a `created_at` window.
