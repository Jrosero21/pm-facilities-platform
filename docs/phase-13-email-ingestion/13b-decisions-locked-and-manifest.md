# Phase 13b — Decisions Locked + Schema Manifest

**Branch:** `phase-13-email-ingestion` (13a committed at `d00d2d1`). **PLANNING DOC ONLY** — no schema, no drizzle, no migration, no code. The six 13a forks are now resolved below; the schema manifest (§4) is **PROPOSED for review, NOT final**.

---

## 1. Decisions Locked (D-1 … D-6)

**D-1 — sender→client resolution.** Parse the external **client identifier out of the email body** and resolve it through the **existing Phase-12 `external_client_mappings` resolver** (one resolution system). The **sender address is a COARSE router only** (selects which parser-rule/format to attempt), never the authoritative client key. The frozen Phase-12 mapping substrate is consumed **read-only**; `external_*` tables are **not edited**. Any genuinely new mapping dimension goes in a **new Phase-13-namespace table**, never an edit to a frozen table.
*Rationale:* one resolution system avoids a second source of client-identity truth; sender addresses are spoofable/shared and make a poor key, so they route but don't decide.

**D-2 — parser type.** **Deterministic, rule-based per-format extractor FIRST.** On parse-fail/partial → **flag to the operator review queue.** AI is a **draft-assist available INSIDE the review queue** (operator confirms before job creation) — never an auto-parser, never auto-creates a job (§2.5). **Both readers ship as STUBBED SEAMS** in Phase 13 (no sample emails yet; live AI is activation work — mirrors the Phase-12 skeleton-not-live adapter).
*Rationale:* deterministic-first is auditable and cheap; AI as review-time assist keeps a human in the loop per §2.5; stubbing both seams lets the substrate land before real formats exist to tune against.

**D-3 — storage.** Email gets its **OWN tables.** Mirror the Phase-12 sync-table **PATTERN** (append-rows + parse-result rows) but **do NOT reuse** `external_sync_runs` / `external_sync_events` / `external_payload_logs`.
*Rationale:* email has its own lifecycle (message → parse → draft → review) that doesn't map cleanly onto WO-sync runs; reusing would overload the external_* semantics and couple two frozen-vs-active domains.

**D-4 — live receiver.** **DEFER.** No IMAP / webhook / mailbox polling. Phase 13 = storage + parse + draft + review + approve-to-job only. Live receipt is the deferred activation layer (mirrors Phase-12 deferred live HTTP). **Banked as CF-13.2.**
*Rationale:* same framework-not-live-integration discipline as Phase 12 — build the substrate the receiver will feed, prove it end-to-end with seeded rows, defer the transport.

**D-5 — draft→job.** `email_work_order_drafts` is its own table; on operator approval a **THIN WRAPPER** calls the existing `createJob` via the **`ingestExternalJob` precedent** — `sourceType = email_ingestion | forwarded_email`, **system-user attribution** (`getSystemUserId`), lands **NEW**. The wrapper is structured so a future **high-confidence auto-create branch** can be added **without reworking the review path**.
*Rationale:* reuse the proven authz-wrapper shape (scope from the source row, never the payload); isolating the approval→createJob seam means CF-13.1 autonomy bolts on later without touching the human path.

**D-6 — source_type semantics.** **One pipeline.** `email_ingestion` = arrived at a monitored intake address; `forwarded_email` = a human forwarded it in. Discriminated at the **`email_ingestion_accounts` / rule level** and **stamped onto the resulting job's `source_type`.**
*Rationale:* both enum values already exist on `jobs.source_type` (13a live-confirmed); the distinction is provenance, not a separate pipeline, so it's an account-level attribute carried through to the job.

**D-7 — parser-rules are config-only (INVARIANT, from OQ-13.6).** `email_parser_rules` holds **ONLY** format + sender-router + extraction config. It **MUST NOT** store any client→id mapping. Client resolution stays in the Phase-12 `external_client_mappings` resolver (D-1). One resolution system; the parser rule produces the *code*, the frozen resolver turns the code into the *id*.
*Rationale:* a second client→id mapping store would reintroduce exactly the dual-truth D-1 forbids; keeping rules config-only enforces the one-resolution-system invariant at the schema level.

---

## 2. Carry-Forwards (intended futures — NOT built now)

- **CF-13.1 — autonomous high-confidence auto-create.** Once real parsing runs and the review queue accumulates enough confirm/correct data to establish a **per-format confidence threshold**, add a branch that **auto-creates a job for above-threshold known formats, skipping the queue.** Gated on accumulated confidence data + a §2.5 relaxation. **The parse-result `confidence` + `matched_format` fields and the draft→job wrapper structure are built NOW to enable this LATER** (records Jonny's stated long-term autonomy intent).
- **CF-13.2 — live email receiver.** IMAP / webhook / mailbox polling deferred to the activation layer.
- **CF-13.3 — deterministic + AI extractor logic.** The actual field-extraction rules AND the AI-assist prompt **drop into their seams once real sample emails exist** to tune/test against.
- **CF-13.4 — attachment physical-storage backend.** `email_attachments.storage_ref` records a reference only (OQ-13.2); the physical storage destination (object store / disk / blob service) is **deferred to activation** — no in-DB blobs, no backend wired in Phase 13.

---

## 3. Watchpoints

- **WP-13.1** — `inbound_emails` (Phase 13, NEW) must **NOT** be confused with the existing **Phase-6 `inbound_messages`** (migration 0011). Distinct purpose (raw intake mail vs. communication-log inbound channel rows), distinct table. The `email_*`/`inbound_*` namespace is shared (13a live-confirmed: `email_templates` + `inbound_messages` already exist) — name and reference carefully.
- **WP-12.2 (inherited)** — long `email_*` table names make drizzle's auto FK-names risk exceeding MySQL's 64-char limit; **pre-name FKs in schema source** (see per-table flags in §4d).
- **MariaDB-JSON parse-at-read (inherited)** — any `json` column (esp. `email_parse_results.extracted_fields`, `inbound_emails.raw_headers`) round-trips as a **raw string** on read; parse at the read boundary (precedents: `billing/events.ts:153`, `agents/drafts.ts:112`).

---

## 4. SCHEMA MANIFEST

> **MANIFEST STATUS: LOCKED (2026-05-31).** All six open questions (§6) resolved; two corrections applied — OQ-13.4 `inbound_emails (tenant_id, message_id)` changed from a hard **UNIQUE → INDEX** (flag-don't-reject dedup), and `email_attachments.storage_ref` confirmed **reference-only** (no in-DB blobs; backend → CF-13.4). All other column names/types/nullability and FK pre-naming stood up under review and are now the construction baseline for 13c.

> Every table carries `tenant_id varchar(36) NOT NULL` (multi-tenant invariant) + `created_at` / `updated_at timestamp NOT NULL`. PK is `id varchar(36)` (uuidv7) throughout, matching app-table convention.

### 4.1 `email_ingestion_accounts`
**Purpose:** the monitored intake identities (an address/mailbox the platform watches) + the provenance discriminator + which parser-rule set to expect.

| Column | Type | Null | Note |
|---|---|---|---|
| id | varchar(36) | NO | uuidv7 PK |
| tenant_id | varchar(36) | NO | FK→tenants, scope pin |
| name | varchar(255) | NO | human label |
| intake_address | varchar(255) | NO | monitored email address |
| source_type | enum('email_ingestion','forwarded_email') | NO | provenance discriminator (D-6) |
| expected_parser_rule_id | varchar(36) | YES | FK→email_parser_rules, default format |
| status | enum('active','inactive','archived') | NO | account lifecycle |
| created_by_user_id | varchar(36) | YES | FK→users SET NULL, creator |
| created_at / updated_at | timestamp | NO | standard audit cols |

**Analog:** `external_systems` (the connection-identity + tenant pin + status + created_by SET NULL).
**Pre-named FK warning:** YES — `email_ingestion_accounts` is 23 chars; `email_ingestion_accounts_expected_parser_rule_id_email_parser_rules_id_fk` would blow past 64. **Pre-name FKs** (`eia_tenant_fk`, `eia_parser_rule_fk`, `eia_creator_fk`).

### 4.2 `inbound_emails`  ⚠ WP-13.1
**Purpose:** one row per received message — the raw intake record (append-only), the email analog of an external sync "received payload."

| Column | Type | Null | Note |
|---|---|---|---|
| id | varchar(36) | NO | uuidv7 PK |
| tenant_id | varchar(36) | NO | FK→tenants, scope pin |
| ingestion_account_id | varchar(36) | YES | FK→email_ingestion_accounts, intake source |
| message_id | varchar(255) | NO | RFC822 Message-ID, dedup key |
| from_address | varchar(255) | NO | sender (coarse router, D-1) |
| to_address | varchar(255) | YES | recipient/intake address |
| subject | varchar(998) | YES | RFC-max subject length |
| body_text | longtext | YES | plain-text body |
| body_html | longtext | YES | html body if present |
| raw_headers | json | YES | header map (JSON-at-read gotcha) |
| received_at | datetime | YES | message timestamp |
| processing_status | enum('received','parsed','drafted','failed','duplicate_flagged') | NO | lifecycle (OQ-13.1; `duplicate_flagged` per OQ-13.4) |
| created_at / updated_at | timestamp | NO | standard audit cols |

**Analog:** `external_sync_runs` (the append intake record) + the raw side of `external_payload_logs` (`raw_headers`/body = the never-reshaped payload).
**Pre-named FK warning:** YES — pre-name (`ie_tenant_fk`, `ie_account_fk`).
**⚠ MANIFEST CORRECTION (OQ-13.4):** `(tenant_id, message_id)` is an **INDEX for duplicate-detection lookup — NOT a hard UNIQUE.** Dedup is **flag-don't-reject**: a repeat `message_id` is STORED (audit trail preserved) and routed to the review queue as `processing_status='duplicate_flagged'` for operator adjudication, never silently hard-rejected by a DB-unique nor silently allowed. (Revises the original 13b proposal, which read "Unique (tenant_id, message_id)".)

### 4.3 `email_parse_results`
**Purpose:** the parser's structured output per message — extracted tokens + confidence + which format matched + the raw extracted-fields payload.

| Column | Type | Null | Note |
|---|---|---|---|
| id | varchar(36) | NO | uuidv7 PK |
| tenant_id | varchar(36) | NO | FK→tenants, scope pin |
| inbound_email_id | varchar(36) | NO | FK→inbound_emails, parsed message |
| parser_kind | enum('deterministic','ai_assist') | NO | which seam produced it (D-2) |
| matched_format | varchar(128) | YES | format/rule key matched (CF-13.1) |
| matched_rule_id | varchar(36) | YES | FK→email_parser_rules, rule used |
| confidence | decimal(5,4) | YES | 0.0000–1.0000 score (CF-13.1; scale = OQ) |
| extracted_fields | json | YES | parsed tokens (JSON-at-read gotcha) |
| extracted_client_code | varchar(64) | YES | parsed client id → D-1 resolver input |
| parse_outcome | enum('parsed','partial','failed') | NO | drives review-queue routing (D-2) |
| created_at / updated_at | timestamp | NO | standard audit cols |

**Analog:** `external_sync_events` (per-item structured outcome) + `NormalizedWorkOrder` as a persisted row (the neutral DTO the deterministic/AI reader emits).
**Pre-named FK warning:** YES — pre-name (`epr_tenant_fk`, `epr_email_fk`, `epr_rule_fk`).

### 4.4 `email_work_order_drafts`
**Purpose:** the reviewable draft before it becomes a job — resolved (possibly partial) ids + lifecycle status + the FKs back to its source email/parse.

| Column | Type | Null | Note |
|---|---|---|---|
| id | varchar(36) | NO | uuidv7 PK |
| tenant_id | varchar(36) | NO | FK→tenants, scope pin |
| inbound_email_id | varchar(36) | NO | FK→inbound_emails, source message |
| parse_result_id | varchar(36) | YES | FK→email_parse_results, source parse |
| draft_status | enum('pending_review','approved','rejected','superseded') | NO | lifecycle (OQ-13.1 RESOLVED) |
| resolved_client_id | varchar(36) | YES | FK→clients, null = parked client (D-1/OQ-13.5) |
| resolved_client_location_id | varchar(36) | YES | FK→client_locations, null → SF-2 auto-stub |
| resolved_trade_id | varchar(36) | YES | FK→trades, nullable (partial) |
| resolved_priority_id | varchar(36) | YES | FK→priorities, nullable (partial) |
| problem_description | text | YES | drafted job text |
| source_type | enum('email_ingestion','forwarded_email') | NO | carried from account → job (D-6) |
| created_job_id | varchar(36) | YES | FK→jobs SET NULL, set on approve (D-5) |
| reviewed_by_user_id | varchar(36) | YES | FK→users SET NULL, operator |
| created_at / updated_at | timestamp | NO | standard audit cols |

**Analog:** `update_rewrite_drafts` (the draft→review→publish lifecycle + the "produced vs. approved" split) + the ingest "park" state (IF-7).
**Partial resolution (OQ-13.1/OQ-13.5):** NOT a separate `draft_status` — a partially-resolved draft is a `pending_review` row with one or more `resolved_*` FKs null. **Asymmetry (OQ-13.5):** an unresolved **location** auto-stubs from the email's address payload + hard-flags "needs review" (Phase-12 **SF-2** pattern); an unresolved **client** still **PARKS** for review, never stubbed (client = billing entity — the Phase-12 **IF-7** park-vs-stub asymmetry holds).
**Pre-named FK warning:** YES (most FK-heavy of the six) — pre-name all: `ewod_tenant_fk`, `ewod_email_fk`, `ewod_parse_fk`, `ewod_client_fk`, `ewod_location_fk`, `ewod_trade_fk`, `ewod_priority_fk`, `ewod_job_fk`, `ewod_reviewer_fk`.

### 4.5 `email_attachments`
**Purpose:** files carried on an inbound message (filename, mime, size, storage reference).

| Column | Type | Null | Note |
|---|---|---|---|
| id | varchar(36) | NO | uuidv7 PK |
| tenant_id | varchar(36) | NO | FK→tenants, scope pin |
| inbound_email_id | varchar(36) | NO | FK→inbound_emails, parent message |
| filename | varchar(255) | NO | original filename |
| mime_type | varchar(128) | YES | content type |
| size_bytes | int | YES | byte size |
| storage_ref | varchar(512) | YES | **reference only** (OQ-13.2); physical backend → CF-13.4 |
| created_at / updated_at | timestamp | NO | standard audit cols |

**Analog:** `job_attachments` (Phase-4 attachment pattern — metadata + storage ref, not inline blobs).
**Storage (OQ-13.2 RESOLVED):** `storage_ref` holds a **reference only — NO in-DB blobs.** The physical storage destination is deferred to activation (**CF-13.4**).
**Pre-named FK warning:** YES — pre-name (`eatt_tenant_fk`, `eatt_email_fk`).

### 4.6 `email_parser_rules`
**Purpose:** tenant/sender → resolution rules (which format applies, how to extract the client code/tokens) — the deterministic seam's config, and the coarse-router target for the sender address (D-1).

| Column | Type | Null | Note |
|---|---|---|---|
| id | varchar(36) | NO | uuidv7 PK |
| tenant_id | varchar(36) | NO | FK→tenants, scope pin |
| name | varchar(255) | NO | rule label |
| match_sender_pattern | varchar(255) | YES | sender domain/address router (D-1) |
| format_key | varchar(128) | NO | format this rule parses |
| extraction_config | json | YES | field-extraction spec (JSON-at-read; CF-13.3) |
| direction | varchar(32) | YES | reserved, mirrors mapping convention |
| status | enum('active','inactive','archived') | NO | rule lifecycle |
| created_at / updated_at | timestamp | NO | standard audit cols |

**Analog:** `external_client_mappings` / `external_location_mappings` (the tenant-scoped resolution-rule family) — but Phase-13-namespaced (D-1: new dimension → new table, never edit frozen external_*).
**Pre-named FK warning:** YES — pre-name (`eprule_tenant_fk`).

> **Manifest status: PROPOSED.** All column names/types/nullability above are for Jonny's review. No drizzle exists yet.

---

## 5. Seam Sketch (prose — both seams are NO-OPS in Phase 13)

Two **stubbed reader seams** behind a common interface (the email analog of `PortalAdapter`):

1. **Deterministic reader (stub).** Given an `inbound_emails` row + a matched `email_parser_rules` row, it would apply the rule's `extraction_config` to pull the client code, location token, trade/priority hints, and problem text, emitting an `email_parse_results` row (`parser_kind='deterministic'`, a `confidence`, `parse_outcome`). **In Phase 13 it returns a fixed "not-implemented / needs-review" result** (no real formats exist yet — CF-13.3). The seam, the `email_parse_results` shape, and the `confidence`/`matched_format` columns are built now so CF-13.1 can later read accumulated confidence.

2. **AI-assist reader (stub).** Available **only inside the operator review queue**, never on the auto path. Given a message the deterministic reader flagged, it would call the agent substrate (Phase-6/7 `runner.ts` + `generateObject`) to *propose* extracted fields for the operator to confirm/correct. **In Phase 13 it is a no-op** (mirrors the Phase-12 skeleton adapter; live AI = CF-13.3 activation). It **never** creates a job — its output is a suggestion the operator accepts into the draft.

**End-to-end flow (the path the substrate supports):**
`inbound_emails` (seeded/stored) → **deterministic reader** → `email_parse_results`
 → if `parsed` & resolvable: build `email_work_order_drafts(pending_review)` with resolved ids
 → if `partial`/`failed`: **review queue**, operator may invoke **AI-assist** → confirm/correct fields → draft
 → **operator approves** → **thin wrapper** (D-5, `ingestExternalJob` precedent) → `createJob(sourceType=…, getSystemUserId(), NEW)` → stamp `created_job_id` on the draft.
The future CF-13.1 auto-create branch slots **between parse-result and draft** for above-threshold known formats, bypassing the queue — without touching the human review path (D-5).

---

## 6. Open Questions — ALL RESOLVED (2026-05-31)

- **OQ-13.1 — `draft_status` + `processing_status` values. RESOLVED.** `email_work_order_drafts.draft_status` = `('pending_review','approved','rejected','superseded')`. **Partial resolution is NOT a separate state** — it is a `pending_review` draft with one or more `resolved_*` FKs null. `inbound_emails.processing_status` = `('received','parsed','drafted','failed','duplicate_flagged')` (`duplicate_flagged` per OQ-13.4). Applied to §4.2 and §4.4.
- **OQ-13.2 — `email_attachments` storage. RESOLVED.** Stores a **REFERENCE only** (`storage_ref varchar(512)`); **NO in-DB blobs** (consistent with the `job_attachments` analog). Physical storage destination **deferred → CF-13.4**. Applied to §4.5.
- **OQ-13.3 — `confidence` score scale. RESOLVED.** `confidence = decimal(5,4)`, scale **0.0000–1.0000, stored precise/continuous.** The UI may render it coarse (high/med/low), but the stored value stays continuous so **CF-13.1's auto-create threshold is a config change, not a schema change.** *This is the autonomy-enabling decision* — keeping the score precise now is what lets the future high-confidence branch tune a threshold without a migration.
- **OQ-13.4 — dedup semantics. RESOLVED — flag-don't-reject.** Duplicate handling is **uniform across all intake types, keyed on `message_id`** (NOT split by `source_type`). A repeat `message_id` is **STORED** (audit trail preserved) but does **NOT** auto-proceed to a draft — it lands in the review queue **flagged** (`processing_status='duplicate_flagged'`) for operator adjudication. **Block/flag, never silent hard-reject, never silent allow.** *Rationale:* ServiceChannel machine notifications won't double-fire; the real duplicate risk is human re-forwarding on other channels. Therefore `(tenant_id, message_id)` is a **DETECTION signal (INDEX + lookup-then-flag), NOT a hard DB-unique** — applied as the **manifest correction in §4.2**.
- **OQ-13.5 — partial-resolution policy. RESOLVED — Path 2 (asymmetric).** An unresolved **LOCATION auto-stubs** from the email's address payload + hard-flags "needs review" (Phase-12 **SF-2**). An unresolved **CLIENT still PARKS** for review, never stubbed (client = billing entity; the Phase-12 **IF-7** park-vs-stub asymmetry holds). Applied to §4.4.
- **OQ-13.6 — parser-rules vs frozen resolver. RESOLVED — config-only invariant.** `email_parser_rules` is **CONFIG-ONLY** (format + sender-router + extraction config) and **MUST NOT** store client→id mapping; client resolution stays in the Phase-12 `external_client_mappings` resolver (D-1). Recorded as an explicit invariant in §1 (**D-7**).

---

## 7. Migration Plan Preview (no migration generated now)

The six tables will span **multiple migrations starting at `0033`** (next free — 13a confirmed `0032` is latest). Likely grouping: substrate/intake first (`email_ingestion_accounts`, `inbound_emails`, `email_attachments`), then parse/draft (`email_parse_results`, `email_work_order_drafts`, `email_parser_rules`) — final split decided at 13c. **Each migration follows the locked cadence:** drizzle entry → `db:generate` → SQL inspect (HALT) → sandbox apply → contract-verify `-E` → **HALT for prod confirm** → prod apply → verify → 4-file commit (schema + `.sql` + `_journal.json` + `snapshot.json`). **Pre-name every FK** per the §4d flags (WP-12.2). **No `db:generate`, no migration, no drizzle in 13b.**
