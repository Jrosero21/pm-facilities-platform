# Phase 4 — Chatbot Knowledge

Source-of-truth for how jobs / work orders work after Phase 4. Written to stand alone: an LLM with only this file should answer operational questions correctly. Cross-references `02-decisions.md`, `06-business-rules.md`, `08-db-changes.md` but does not depend on them. Builds on Phase 2 (clients/locations) and Phase 3 (vendors/trades) chatbot knowledge.

## K-4.1 — What Phase 4 adds
The aggregator can now create and view **jobs** (work orders) — the central operational object every later phase hangs off. A job links a **client** + **client location** (Phase 2), a **trade** (Phase 3 global taxonomy), a tenant **priority**, and a **status**; carries a **source_type** (where it came from); and accumulates **contacts**, **notes**, typed **history**, and a **timeline of events**. CRUD is **create + read only** in Phase 4 — no edit/archive UI, no status transitions yet (those come with dispatch in Phase 5).

## K-4.2 — The 11 tables and how they relate
All ids are app-generated UUID v7 (`varchar(36)`); all are InnoDB / utf8mb4. All carry `tenant_id` **except `job_statuses`** (global).
```
                 priorities (TENANT-scoped)   job_statuses (GLOBAL)   trades (GLOBAL, Phase 3)
                        │                          │                      │
clients ─┐              └──────────┐     ┌─────────┘        ┌─────────────┘
         ├─ client_locations ──┐   │     │                  │
         │                     ▼   ▼     ▼                  ▼
         └────────────────────► jobs ◄── current_status_id / priority_id / primary_trade_id
                                 │   (job_number per-tenant, source_type, is_archived, scope fields…)
                                 ├──< job_contacts
                                 ├──< job_notes            (visibility)
                                 ├──< job_attachments      (schema-only; visibility)
                                 ├──< job_status_history   (from/to status_id)
                                 ├──< job_priority_history (from/to priority_id)
                                 ├──< job_trade_history    (from/to trade_id)
                                 └──< job_events           (event_type stream)

tenant_job_sequences (tenant_id PK, next_number)  ── allocates jobs.job_number
```
- **`jobs`** — the spine. `id`, `tenant_id`, `job_number` (int unsigned, per-tenant), `client_id` → clients, `client_location_id` → client_locations, `primary_trade_id` → trades (nullable), `priority_id` → priorities (nullable), `current_status_id` → job_statuses (NOT NULL), `source_type` enum(8), `source_external_id` (null), `problem_description` (text NN), `scope_of_work` / `generated_scope_of_work` / `approved_scope_of_work` (text null), `scope_generation_status` (varchar default `not_started`), `not_to_exceed_amount` (decimal null), `scheduled_start_at`/`scheduled_end_at`/`due_at`/`completed_at`/`closed_at` (datetime null), `is_archived` (bool), `created_by_user_id`, timestamps. Unique `(tenant_id, job_number)`.
- **`priorities`** *(tenant-scoped)* — id, tenant_id, name, description, code (uppercase), rank (lower=more urgent), status. Unique `(tenant_id, code/name)`.
- **`job_statuses`** *(GLOBAL)* — id, name, description, code, category enum(open/in_progress/on_hold/completed/cancelled), sort_order, is_terminal, status. Unique `(code)`/`(name)`. No tenant_id.
- **`job_contacts`** — mirrors vendor/client contacts (name/title/email/phone/is_primary/notes/status).
- **`job_status_history` / `job_priority_history` / `job_trade_history`** — append-only typed transitions: `from_*_id` (nullable; null on the first), `to_*_id` (NN), `changed_by_user_id`, `note`, `created_at`. Identical shape; only the reference FK differs.
- **`job_notes`** — `body` (text), `visibility` enum (default `internal_only`), `status`.
- **`job_attachments`** *(schema-only)* — `title`, `attachment_type` enum, `file_url`/`file_size_bytes`/`file_mime_type` (null until file-upload infra), `visibility`, `status`.
- **`job_events`** — append-only timeline: `event_type` (varchar), `actor_user_id` (null for system), `summary`, `metadata` (json), `created_at`.
- **`tenant_job_sequences`** — per-tenant `job_number` counter (tenant_id PK, next_number).

## K-4.3 — The global-vs-tenant reference principle
`trades` and `job_statuses` are **global**; `priorities` are **tenant-scoped**. The principle: **global** = data the platform's own code reasons about semantically (trades for capability matching, statuses for state machines / dispatch / analytics); **tenant-scoped** = data that encodes a tenant's business semantics the platform doesn't itself reason about (priorities). This is why `priorities` inverts the `trades` global model (D-3.1) while `job_statuses` follows it. Future status taxonomies (dispatch/proposal/invoice statuses) are global; tenant-customizable vocabularies are tenant-scoped.

## K-4.4 — Source-agnostic architecture
A job's `source_type` records where it originated: `manual`, `internal_client_portal`, `external_client_portal`, `email_ingestion`, `forwarded_email`, `api`, `preventative_maintenance`, `snow_event`. The **internal job model is identical regardless of source** — external portals, email, and API are input channels that set `source_type` (+ optionally `source_external_id`). **ServiceChannel is NOT a `source_type` value** — it maps to the generic `external_client_portal` channel; the specific external system is recorded later via Phase 12's `external_systems` / `external_work_order_links`. (Do not propose adding `servicechannel` to the enum — the enum stays generic channel-types by design.) There is **no uniqueness on `source_external_id`** in Phase 4; duplicate detection is Phase 12's linking-table concern.

## K-4.5 — How a job is created (the 7-step transaction)
`createJob` runs read-only parent guards (client in tenant; location belongs to that client AND is in tenant; priority in tenant if given; trade exists globally if given; the global NEW status resolves), then **one DB transaction** with seven steps: (1) ensure the tenant's sequence row, (2) lock it `FOR UPDATE` and read `n`, (3) insert the job with `job_number = n` and `current_status_id = NEW`, (4) bump the counter to `n+1`, (5) insert the initial `job_status_history` row (`from = NULL → NEW`, changed_by = creator), (6) insert the `job.created` `job_events` row, (7) insert the `audit_logs` row. All seven are atomic — a partial state (counter bumped without a job, job without history) would be corrupt. The `FOR UPDATE` lock serializes concurrent creates so `job_number` is gapless. New jobs always start at **NEW** (resolved internally by code; there's no status picker on the create form).

## K-4.6 — `job_number` allocation
`job_number` is a **per-tenant** monotonic integer (so each aggregator numbers its own jobs from 1), allocated from `tenant_job_sequences` inside the createJob transaction under a row lock. It's the human-facing id (shown as "#1"); the UUID `id` is the real PK. A per-tenant display prefix ("DEMO-00001") is a future render-time concern, not stored.

## K-4.7 — Two history layers + the audit-rule split
A meaningful change writes **two** layers: a per-attribute **typed history** row (`job_status_history` etc. — the authoritative from→to transition log) **and** a **`job_events`** timeline row (the human-readable feed) — both in the same transaction. Separately, **`audit_logs`** records the create. The **audit-rule split**: multi-step writes that include history/event rows put the audit row **inside** the transaction (`tx.insert(auditLogs)` — atomicity); single-row mutations (a contact, a note) use **`writeAuditLog()` outside** the transaction (resilience — it swallows errors so audit never breaks the main flow). The distinguisher is whether the audit must be atomic with sibling history/event rows.

## K-4.8 — Two status axes; Completed vs Closed
A job has a **workflow status** (`current_status_id` → job_statuses) and a separate **record-lifecycle flag** (`is_archived`). They're orthogonal — a terminal job is still a live record; archiving hides it from lists without changing its workflow meaning. Among statuses, **Completed** (work done, paperwork/invoicing pending) and **Closed** (everything done including billing + final review) are distinct terminal states — Phase 8 lets multiple invoices land against a Completed job before it moves to Closed.

## K-4.9 — Screens & the dependent-picker pattern
Screens (under `(app)`): `/jobs` (list, newest first), `/jobs/new` (create form), `/jobs/[id]` (detail: core fields + Contacts + Notes + Timeline). The new-job form uses the **dependent-picker pattern**: it ships all the tenant's clients + locations and filters locations client-side by the selected client; the location `<select>` is `key={clientId}` so switching client remounts it and resets the selection. This is why `JobForm` ships all locations rather than fetching on change — no loading/race surface; the server `LOCATION_CLIENT_MISMATCH` guard backs it. Phase 5's vendor→location picker reuses this pattern.

## K-4.10 — Worked example: Job #1
In the `demo` tenant: **Job #1** (id `019e603a-00c7-77de-b8e7-85259361aa07`) — client **Apple**, location **Apple 5th Ave**, trade **Plumbing**, priority **High**, status **New**, source **Manual**, problem "Toilet clog in main floor restroom. Water backing up. Reported by store manager." (initial scope left blank). It has one contact (**Store Manager**, title Manager) and one note ("Vendor dispatched for emergency response.", internal_only). Creating it wrote: the job row (`job_number = 1`), one `job_status_history` row (null → NEW), one `job_events` row (`job.created`, "Job #1 created"), one `audit_logs` row (`job.created`, inside the txn), and bumped `tenant_job_sequences.next_number` to 2. Adding the contact and note each wrote a `job_contact.created` / `job_note.created` audit row via `writeAuditLog` (outside any txn).

## K-4.11 — Audit & event vocabularies
`audit_logs` uses `<entity>.<verb>` for **operational creates by users**: `job.created` (inside the createJob transaction, R-4.5), `job_contact.created` and `job_note.created` (outside the transaction via `writeAuditLog`). The reference-data **seed scripts** (priorities, job_statuses, trades, the tenant_job_sequences row) write **no** audit rows — they're bootstrap data, not user actions.

`job_events.event_type` is a documented `varchar` vocabulary, not an enum. In Phase 4 only **`job.created`** actually fires (written by the createJob transaction). The rest — `job.status_changed`, `job.priority_changed`, `job.trade_changed`, `job.note_added`, `job.contact_added` — are **reserved vocabulary**: documented for Phase 5+ but **no Phase 4 code writes them**. They're listed now so the vocabulary is stable when Phase 5/6/7/8 begin emitting them (and add new ones like `job.vendor_assigned`) without a migration (R-4.11).

## K-4.12 — What does NOT exist yet (do not claim these)
- **No dispatch** — jobs can't be assigned to vendors, no ETAs/check-ins. That's **Phase 5**. (The capability layer — vendor trade coverage + service areas — exists from Phase 3, but nothing matches jobs to vendors yet.)
- **No status / priority / trade transitions** — a job is created at NEW and can't be moved through the workflow in Phase 4. The history tables exist for when Phase 5+ adds transitions; only the initial status-history row is written.
- **No AI scope generation** — `generated_scope_of_work` / `approved_scope_of_work` / `scope_generation_status` columns exist but are unused (default `not_started`). That's **Phase 7**.
- **No edit / archive / delete UI** for jobs, contacts, or notes — create + view only.
- **No note-visibility control** — every note is `internal_only`; the picker + workflow are **Phase 6**.
- **No attachments UI / file upload** — `job_attachments` is schema-only (gated on file-upload infrastructure).
- **No billing / invoicing** — `not_to_exceed_amount` exists; Completed→Closed billing flow is **Phase 8**.
- **No list pagination / search / filter**, no field validation beyond required-attribute.
- **No client portal / vendor portal** job submission — Phases 10/11. The owned + external portals will reuse this same job model.
