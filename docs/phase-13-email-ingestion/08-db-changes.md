# Phase 13 — Database Changes

6 new `email_*` tables across 3 migrations (0033–0035), sandbox + prod applied + contract-verified. **Prod + sandbox at close: 99 tables / 36 migrations.** All FKs pre-named (WP-12.2); all tables InnoDB / utf8mb4.

## Migration 0033 — config substrate
- **`email_parser_rules`** — `id, tenant_id, name, match_sender_pattern varchar(255), format_key varchar(128), extraction_config json, direction varchar(32), status enum(active/inactive/archived), created_at, updated_at`. FK `eprule_tenant_fk` → tenants CASCADE. **NO client→id column (D-7).**
- **`email_ingestion_accounts`** — `id, tenant_id, name, intake_address varchar(255), source_type enum('email_ingestion','forwarded_email') NOT NULL, expected_parser_rule_id (nullable), status enum, created_by_user_id (nullable), created_at, updated_at`. FKs: `eia_tenant_fk`→tenants CASCADE, `eia_parser_rule_fk`→email_parser_rules **SET NULL**, `eia_creator_fk`→users **SET NULL**.

## Migration 0034 — storage + parse
- **`inbound_emails`** (⚠ WP-13.1 — distinct from `inbound_messages`) — `id, tenant_id, ingestion_account_id (nullable), message_id varchar(255) (nullable), from_address NOT NULL, to_address, subject varchar(998), body_text longtext, body_html longtext, raw_headers json, received_at datetime, processing_status enum('received','parsed','drafted','failed','duplicate_flagged') default 'received', created_at, updated_at`. FKs: `ie_tenant_fk`→tenants CASCADE, `ie_account_fk`→email_ingestion_accounts **SET NULL**. **Dedup index `inbound_emails_tenant_message_idx (tenant_id, message_id)` is NON-UNIQUE** (OQ-13.4 flag-don't-reject — a unique would invert the decision; verified live NON_UNIQUE=1, harness C3).
- **`email_attachments`** — `id, tenant_id, inbound_email_id NOT NULL, filename NOT NULL, mime_type, size_bytes int, storage_ref varchar(512) (reference-only, OQ-13.2/CF-13.4), created_at, updated_at`. FKs: `eatt_tenant_fk`→tenants CASCADE, `eatt_email_fk`→inbound_emails **CASCADE**.
- **`email_parse_results`** — `id, tenant_id, inbound_email_id NOT NULL, parser_kind enum('deterministic','ai_assist') NOT NULL, matched_format varchar(128), matched_rule_id (nullable), confidence decimal(5,4) (CF-13.1 continuous), extracted_fields json, extracted_client_code varchar(64) (plain string — D-7, feeds the resolver), parse_outcome enum('parsed','partial','failed') NOT NULL, created_at, updated_at`. FKs: `epr_tenant_fk`→tenants CASCADE, `epr_email_fk`→inbound_emails **CASCADE**, `epr_rule_fk`→email_parser_rules **SET NULL**.

## Migration 0035 — the reviewable draft (FK-heaviest, 9 FKs)
- **`email_work_order_drafts`** — `id, tenant_id, inbound_email_id NOT NULL, parse_result_id (nullable), draft_status enum('pending_review','approved','rejected','superseded') default 'pending_review', source_type enum('email_ingestion','forwarded_email') NOT NULL, problem_description text, resolved_client_id, resolved_client_location_id, resolved_trade_id, resolved_priority_id (ALL nullable — partial resolution), created_job_id, reviewed_by_user_id, reviewed_at datetime, created_at, updated_at`.
- **FK delete-rule design (2 CASCADE / 7 SET NULL):** only `ewod_tenant_fk`→tenants and `ewod_email_fk`→inbound_emails are **CASCADE** (hard parents). The other 7 — `ewod_parse_fk`→email_parse_results, `ewod_client_fk`→clients, `ewod_location_fk`→client_locations, `ewod_trade_fk`→trades, `ewod_priority_fk`→priorities, `ewod_job_fk`→jobs, `ewod_reviewer_fk`→users — are **SET NULL**: the draft is an audit record of what arrived, so deleting a referenced entity nulls the link, never deletes the draft. (Verified live: harness tally CASCADE=2 / SET NULL=7.)

## Conventions
- All FK columns get explicit FK-backing indexes (the 6d/6g lesson).
- `json` columns (`extraction_config`, `raw_headers`, `extracted_fields`) are MariaDB `longtext`+`json_valid` and round-trip as raw strings on read — parse at the boundary.
- `confidence` is `decimal(5,4)` (returns a string on read).
