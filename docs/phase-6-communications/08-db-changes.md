# Phase 6 — Database Changes

## Summary
Three migrations add **12 tables**. All InnoDB / utf8mb4 / utf8mb4_unicode_ci, app-generated UUID v7 PKs, all tenant-scoped.
- **`0010`** — communication schema (4): `communication_logs` (the unifying spine), `outbound_messages`, `inbound_messages`, `email_templates`.
- **`0011`** — update-engine forward-decls (2, schema-only): `vendor_update_logs`, `portal_update_queue`.
- **`0012`** — agent substrate + rewriter I/O + update output (6): `agent_runs`, `agent_tool_calls`, `agent_decisions`, `update_rewrite_drafts`, `update_rewrite_reviews`, `client_update_logs`.

Total recorded migrations after Phase 6: **13** (`0000`–`0012`).

## Migration 0010 — communication schema

### communication_logs — the unifying spine (delivery layer lives here; supersedes R-5.15)
`id` PK · `tenant_id` → tenants (**cascade**) · `job_id` → jobs (**cascade**, NN) · `channel` enum(internal_note,vendor_portal,client_portal,email,sms,external_portal,phone_call) NN · `direction` enum(outbound,inbound,internal) NN · `source_type` enum(dispatch_message,outbound_message,inbound_message,job_note,client_update,vendor_update) NN · `source_id` varchar(36) NN (**no FK** — polymorphic) · `visibility` enum(5-value) default internal_only · `summary` varchar(500) NN (create-time excerpt) · `sent_by_user_id` (set null) · `recipient_type` enum(vendor_contact,client_contact,external,internal,none) default none · `recipient_id` varchar(36) (no FK) · `recipient_email`/`recipient_phone` · `cc`/`bcc` text · `delivery_status` enum(draft,queued,sent,delivered,failed,bounced,received) default draft · `sent_at`/`delivered_at`/`read_at` datetime · `status` · timestamps. FKs `cl_tenant_fk`/`cl_job_fk` (cascade), `cl_sent_by_fk` (set null). Indexes: `cl_tenant_job_created_idx`, `cl_source_idx(source_type,source_id)`, `cl_tenant_status_idx`, `cl_tenant_channel_idx`, `cl_tenant_recipient_idx`.

### email_templates / outbound_messages / inbound_messages
- **email_templates** (`et_`) — `name`, `subject_template`, `body_template` (Mustache `{{...}}`), `applicable_channels` **json**, `created_by_user_id`. Unique `(tenant_id, name)`. No render/send pipeline (Phase 13).
- **outbound_messages** (`om_`) — channel-detail for composed outbound: `subject`, `body` NN, `template_id` → email_templates (set null). (6e.5 builds the compose UI.)
- **inbound_messages** (`im_`) — `external_sender`, `subject`, `raw_body` NN, `received_at` NN, `parse_status` varchar(32) default `unparsed`. (Phase 13 email parser auto-populates.)

## Migration 0011 — update-engine forward-decls (schema-only, no Phase 6 writer)
- **vendor_update_logs** (`vul_`) — vendor-origin update ledger; inbound mirror of `client_update_logs`. `job_id` (cascade, NN), `vendor_id` → vendors (**set null**), `content` text NN, `received_at` datetime NN, `status`, timestamps. Index `vul_tenant_job_idx`. **Activated Phase 10** (vendor portal); per LOCK 1, Phase 10+ registers `vendor_update` as a polymorphic rewriter input via the same contract.
- **portal_update_queue** (`puq_`) — outbound portal-push queue. `job_id` (cascade, NN), `target_portal` enum(client_portal,vendor_portal,external_portal) NN, `source_type` varchar(32) NN + `source_id` varchar(36) NN (polymorphic, like the spine), `queue_status` enum(queued,processing,sent,failed,cancelled) default queued, `attempts` int, `scheduled_at`/`processed_at` datetime, `last_error` text, `status`, timestamps. Indexes `puq_tenant_status_idx`, `puq_source_idx`. **Activated Phase 12/13** (client portal + send pipeline). The Phase 6 "update queue concept" deliverable is realized by the rewriter **draft** queue, not this table.

## Migration 0012 — agent substrate + rewriter I/O + client updates
Audit-substrate tables (`agent_runs`/`agent_tool_calls`/`agent_decisions`) are **immutable — no soft-delete `status` enum** (R-6.11).

### agent_runs (`ar_`)
`id` PK · `tenant_id` (cascade) · `agent_id` varchar(64) NN · `status` enum(running,succeeded,failed) default running · `trigger_source` varchar(32) default operator_manual · `triggered_by_user_id` (set null) · `job_id` (**cascade, nullable** — non-job agents later) · `input_summary`/`output_summary` varchar(500) · `model` varchar(64) · `prompt_version` varchar(64) · `input_tokens`/`output_tokens` int · `error_message` text · `started_at` datetime NN · `completed_at` datetime · timestamps. FKs `ar_tenant_fk`/`ar_job_fk` (cascade), `ar_triggered_by_fk` (set null). Indexes `ar_tenant_agent_created_idx(tenant_id,agent_id,created_at)`, `ar_tenant_status_idx`, `ar_job_idx`.

### agent_tool_calls (`atc_`) / agent_decisions (`ad_`) — immutable, created_at only
- **agent_tool_calls** — `tenant_id` (cascade), `agent_run_id` → agent_runs (**cascade**, NN), `sequence` int NN, `tool_name` varchar(128) NN, `tool_kind` enum(read,write) NN, `tool_input`/`tool_output` **json**, `status` enum(ok,error) default ok, `error_message`. Index `atc_run_seq_idx(agent_run_id,sequence)`.
- **agent_decisions** — `tenant_id` (cascade), `agent_run_id` (**cascade**, NN), `decision_type` varchar(64) NN, `proposed_action` varchar(500), `reasoning` text, `confidence` enum(high,medium,low), `policy_check` varchar(128), `disposition` enum(queued_for_review,auto_executed,policy_blocked) NN, `metadata` **json**. Index `ad_run_idx`.

### update_rewrite_drafts (`urd_`) / update_rewrite_reviews (`urr_`)
- **update_rewrite_drafts** — `tenant_id`/`job_id`/`agent_run_id` (all **cascade**, NN) · `source_type` enum(job_note,vendor_update) default job_note · `source_id` NN · `draft_content` text NN · `status` enum(pending_review,approved,rejected,discarded,published) default pending_review · `published_communication_id` → communication_logs (**set null**) · timestamps. Indexes `urd_tenant_job_idx`, `urd_tenant_status_idx`, `urd_run_idx`, `urd_source_idx`.
- **update_rewrite_reviews** — `tenant_id` (cascade), `draft_id` → update_rewrite_drafts (**cascade**, NN), `reviewer_user_id` (set null), `decision` enum(approve,reject) NN, `edited_content` text (null — operator edit; draft_content immutable), `review_notes` text, `reviewed_at` datetime NN. Index `urr_draft_idx`.

### client_update_logs (`cul_`) — the published rewriter output (active 6f sibling)
`id` PK · `tenant_id`/`job_id` (**cascade**, NN) · `content` text NN · `source_draft_id` → update_rewrite_drafts (**set null**, provenance) · `created_by_user_id` (set null) · `status` (soft-delete) · timestamps. Index `cul_tenant_job_idx`.

## FK delete rules (migration 0012 — 18 FKs)
- **CASCADE:** every `tenant_id` → tenants; `*.job_id` → jobs; the `agent_run_id` chains (`atc_`/`ad_`/`urd_` → agent_runs); `urr_draft_id` → update_rewrite_drafts.
- **SET NULL:** every `*_user_id` → users; `update_rewrite_drafts.published_communication_id` → communication_logs; `client_update_logs.source_draft_id` → update_rewrite_drafts.
Breakdown: agent_runs 3 · agent_tool_calls 2 · agent_decisions 2 · update_rewrite_drafts 4 · update_rewrite_reviews 3 · client_update_logs 4 = **18**.

## Index-count note (verify explicit indexes, not totals)
Migration 0012's 6 tables have **11 explicit named indexes + 10 InnoDB FK-backing = 21 total**. InnoDB auto-creates a backing index for every FK whose column isn't already the leftmost prefix of an explicit index (8 of the 18 FKs are covered → 10 need backing). **Verify explicit-index presence + compound shape, not the total count** (the 6d 10-vs-9 FK + 6g.a 21-vs-11 index lessons). (`04-admin-sop.md` SOP-6.C.)

## JSON-as-longtext on MariaDB — and the read-parse gotcha
JSON columns: `communication_logs` (none — cc/bcc are text), `email_templates.applicable_channels`, `agent_tool_calls.tool_input`/`tool_output`, `agent_decisions.metadata`. As in Phase 4/5, MariaDB stores Drizzle `json()` as `longtext` + an auto `CHECK (json_valid(...))`; `information_schema.DATA_TYPE` reports `longtext`. **New in Phase 6:** Drizzle's mysql json type **does not parse on read** — a json column comes back a **string**; any data-layer read exposing one must `JSON.parse` (e.g. `listDraftsForJobDetailed` parses `agent_decisions.metadata`). Writes are fine. (R-6.19; L-6.13.)

## Seed / keeper data
No new reference seeds (Phase 6 adds no global reference tables). The **Job #2 rewriter chain** (operator-driven keeper demo, real Sonnet 4.6) is persisted: 1 `agent_run` + 4 `agent_tool_calls` + 1 `agent_decision` + 1 `update_rewrite_drafts` (published) + 1 `update_rewrite_reviews` (approve) + 1 `client_update_logs` + the resulting `communication_logs` row, plus the earlier 6e shared-note communication. Job #2 thus carries **2 communications**. (`10-known-limitations.md` L-6.16.)

## Verification
```bash
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 13
# 0012 FK delete rules (expect 18; SOP-6.B). Explicit indexes present w/ shapes (SOP-6.C).
mysql ... -e "SHOW CREATE TABLE agent_decisions\G" | grep metadata   # longtext + json_valid CHECK
mysql ... -e "SELECT agent_id, status, model, input_tokens, output_tokens FROM agent_runs ORDER BY created_at DESC LIMIT 1;"
# update_rewriter_v1 / succeeded / anthropic/claude-sonnet-4-6 / 679 / 232
```

## Forward pointers
- **Phase 7** decides `agent_drafts` shared-vs-specialized + adds `agent_policies` (the `REWRITER_POLICY` seam) + `ai_prompt_templates` (DB-stored prompts; `prompt_version` is implicitly `(agent_id, prompt_version)` today).
- **Phase 10/12/13** activate `vendor_update_logs` (vendor portal), `portal_update_queue` + `email_templates` rendering + `inbound_messages` parsing (send/parse pipeline).
- **Phase 9** analytics may add indexes (e.g. `agent_runs` by model/cost) and should **normalize the model-routing string** (gateway `"anthropic/…"` vs direct bare id) when grouping by model (L-6.9).
