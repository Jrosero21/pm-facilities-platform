# Phase 13a — Design Proposal (email ingestion)

**Status: OPTIONS, NOT DECISIONS.** This frames the Phase-13 shape and lists the open forks for Jonny to resolve at 13b. Nothing here is locked. No schema is authored, no fork is decided. Grounded in the 13a inspection findings; **live-DB verdicts are still owed** (inspection §7 — tunnel was down).

## Goal (roadmap §8 — Phase 13)
Ingest inbound work-order **emails** (a client emails/forwards a request) and turn each into a reviewable **draft → job** on the same substrate, keeping the platform source-agnostic (§2.1). Like Phase 12, the expected scope is a **framework + parsing path, not a live mail-server integration** — the actual IMAP/webhook receiver is the activation work, deferred unless the roadmap says otherwise (a 13b fork).

## Proposed shape — the 6 roadmap tables, each mirroring a Phase-12 analog
> Counts/names indicative only. The point is the **mapping** from each new table to an existing precedent, so we reuse rather than reinvent.

| Proposed table | Purpose | Phase-12 analog to mirror |
|---|---|---|
| `inbound_emails` | one row per received message (message-id, from/to, subject, received_at, raw headers, tenant scope) | `external_sync_runs` + the raw side of `external_payload_logs` |
| `email_attachments` | files on a message (filename, mime, size, storage ref) | (new — no direct P12 analog; mirror attachment patterns from `job_attachments`) |
| `email_parse_results` | the parser's structured output per message (extracted client/location/trade/priority tokens, problem text, confidence) | `NormalizedWorkOrder` (as a persisted row) + `external_sync_events` |
| `email_parser_rules` | tenant/sender → resolution rules (domain→client, keyword→trade, etc.) | `external_client_mappings` / `external_location_mappings` (the resolution family) |
| `work_order_drafts` | the reviewable draft before it becomes a job (resolved ids + flags + status pending/approved/rejected) | `update_rewrite_drafts` (draft→review→publish) + the ingest "park" state (IF-7) |
| `email_ingestion_runs` (or reuse) | batch/poll run + per-message events | `external_sync_runs` / `external_sync_events` — **possibly REUSE the external_sync_* tables** with a `run_type='email_ingest'` rather than new tables (fork I-1) |

## Draft→job thin-wrapper sketch (the `ingestExternalJob` precedent)
```
ingestEmailJob({ inboundEmailId })           // server wrapper = sole authz/scope gate
  → load inbound_emails row → derive tenantId FROM the row (never the payload)
  → createdByUserId = await getSystemUserId()        // SF-1, REUSED as-is
  → parse → email_parse_results (neutral DTO, like NormalizedWorkOrder)
  → resolve sender→client / token→location / codes→trade·priority   // core/mapping.ts family
      → unmapped client → PARK as work_order_drafts(status=pending)  // IF-7 analog
  → on operator approve: createJob(sourceType='email_ingestion'|'forwarded_email',
                                   sourceExternalId=messageId, status NEW)  // IF-6
  → link draft→job + sync log                                          // IF-4 + sync.ts
```
The engine does **no auth** (trusts the pinned ctx); the wrapper is the only gate — identical to Phase 12.

## FORKS — UNRESOLVED, for Jonny at 13b
**I-1 · Reuse `external_sync_*` vs new `email_ingestion_runs`.** The run/event/payload substrate already exists and is source-neutral. Reuse with `run_type='email_ingest'` (less schema, one history substrate) **vs** dedicated email tables (cleaner separation, email-specific columns). *Tradeoff: DRY/one-substrate vs domain clarity.* — UNRESOLVED.

**I-2 · Sender→client resolution key.** `clients` has no email/domain column (inspection §6). Options: (a) new `email_parser_rules` mapping table keyed on sender domain/address (mirrors `external_client_mappings`); (b) add a `domain` column to `clients`; (c) match against existing `client-details` contact emails. *Tradeoff: explicit mapping (auditable, multi-domain) vs column-on-clients (simple, one-domain) vs reuse-contacts (no new schema, fuzzy).* — UNRESOLVED.

**I-3 · Parser substrate.** Deterministic rules (`email_parser_rules`) **vs** an LLM agent (reuse the Phase-6/7 agent runner — `runner.ts`, draft→review→publish, generateObject) to extract structured fields from free-text email. *Tradeoff: deterministic/cheap/brittle vs LLM/flexible/cost+review-gated.* The agent substrate is already built and is the natural fit for free-text → structured. — UNRESOLVED.

**I-4 · Live receiver scope.** Framework + parser only (manual/seeded email rows, like the P12 skeleton adapter) **vs** a live IMAP/webhook receiver this phase. *Tradeoff: matches the "framework not live integration" precedent vs end-to-end now.* — UNRESOLVED (likely framework-only per §8 + the P12 precedent, but Jonny decides).

**I-5 · `work_order_drafts` vs reuse `update_rewrite_drafts`.** A dedicated draft table for email→job **vs** generalizing the existing agent-draft tables. *Tradeoff: purpose-built columns vs draft-substrate unification (the same "agent_drafts unification" question Phase 7 deferred).* — UNRESOLVED.

**I-6 · `forwarded_email` vs `email_ingestion` semantics.** Both enum values exist on `jobs.source_type`. Define when each applies: direct-to-platform inbox = `email_ingestion`; client/operator forwards an external thread = `forwarded_email`? Or collapse to one? Also: does `vendor_invoices.source_type` (which lacks `forwarded_email`) need extending? — UNRESOLVED.

## Inherited discipline (carries into 13b/13c, not re-litigated)
- §2.1 source-agnostic: email is a new source path; **core imports no email specifics**, exactly as it imports no adapter.
- IF-6 land-at-NEW, R-5.8 no-silent-advance; IF-7 park-on-unmapped; IF-4 orphan-window known-limitation.
- SF-1 system user **reused as-is** for unattended attribution.
- WP-12.1 (name DB explicitly), WP-12.2 (pre-name FKs — `email_*` names are long), MariaDB-JSON parse-at-read, §10 read-verdicts-from-file.
- Migration cadence: drizzle entry → generate → SQL inspect (halt) → sandbox apply → contract-verify `-E` → halt for prod confirm → prod apply → 4-file commit.

## Live-DB findings now folded in (tunnel re-opened — inspection §7 RESOLVED)
- `jobs.source_type` confirmed carrying both `email_ingestion` + `forwarded_email` → **no prerequisite enum migration.**
- Net-new confirmed, with **WP-13.1**: the `email_*`/`inbound_*` namespace already holds Phase-6's `email_templates` + `inbound_messages` — pick Phase-13 names that don't collide or confuse (`inbound_emails` ≠ `inbound_messages`).
- `clients` has no email/domain column (confirmed) but carries `client_code varchar(64)` — a candidate **parser-rule target** for fork I-2 (domain → client_code → client), not a sender key itself.
- **`portal_update_queue` is a strong reuse signal for any outbound email** — it already has polymorphic `source_type varchar(32)`+`source_id` and a `queue_status` lifecycle; an email-originated outbound update enqueues here without new schema (relevant if Phase 13 ever sends, not just ingests).
- **`audit_logs.actor_label varchar(128)`** lets a system-originated email-ingest audit row read clearly alongside the SF-1 `user_id` — use it for ingest attribution legibility.

These resolve the 13a owed verdicts; the **six forks above remain UNRESOLVED** for Jonny at 13b.
