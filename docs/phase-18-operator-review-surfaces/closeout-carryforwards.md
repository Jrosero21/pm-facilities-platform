# Phase 18 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-16-chatbot-ai-assistant/closeout-carryforwards.md`, with the three items Phase 18 discharges
removed (and one line split) and the two new Phase-18 soft items added.

## Discharged this phase (verified — NOT carry-forward)

| Item | Evidence | Source of record |
|---|---|---|
| `/review` cross-job AI-draft queue (tenant-wide triage of pending+approved drafts) | harness A6–A10, build 18b | — |
| **FB-10a.3** — Operator vendor-updates inbox | harness A1–A5 + the Vendor-updates tab | Phase-10 §A.1 (definitional) |
| **FB-10l.2** — Operator note visibility-promotion writer | harness C1–C7, D1–D6 | Phase-10 §A.3 (definitional) |
| **FB-10l.3** — `requires_review` visibility workflow undefined | `requires_review` is now a promotable inbox source (R-18.3/R-18.5) | Phase-10 §B (definitional) |
| Cross-tenant isolation on both readers + the promotion guard | harness B1–B2, C8 | — |
| Write-boundary / Fork-1: promotion writes flip + audit ONLY, no outbound | harness D1–D6 | — |
| ZERO new tables / ZERO migrations (migration-free hypothesis held) | table count 115; latest migration 0041 | — |

> **Note on FB-10a:** the Phase-16 bank carried `FB-10a.1/.3` as one line. Phase 18 retires **`.3`**
> (the inbox); **`FB-10a.1` (vendor/client invite & onboarding flow) remains OPEN** and is rolled
> forward below.

## New Phase-18 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-18.1** | **Queue original-source note** — the cross-job draft queue omits the originating note body the per-job section shows; operators click through to the job for context. | An extra join/fetch of the source note body into `DraftQueueItem`. | Soft UX; the job link suffices today and the bodies span jobs. |
| **CF-18.2** | **`(tenant_id, origin)` index on `job_notes`** — `listVendorUpdates` does a tenant-prefix scan filtered on `origin`. | A single index (migration `0042`). | Soft perf; low vendor-note volume today, and Phase 18 was deliberately migration-free. |

## Inherited (roll forward, UNCHANGED — from the Phase-16 bank)

### Phase-16 banked items (open)
| Id | Item |
|---|---|
| B-16.3 | Chat UI + vendor-direction publish target. |
| B-16.4 | Vendor performance reader + populate `vendor_performance_scores`. |
| B-16.5 | LLM-assisted draft phrasing (provider seam + `ai_prompt_templates`). |
| CF-16.1 | `source_type` intent-tag enum value on `update_rewrite_drafts`. |
| CF-16.2 | Invoice-aging anomaly rule (extend `flagInvoiceAnomalies`). |
| CF-16.3 | `source_id` polymorphic-meaning doc (jobId for assistant drafts vs note/update row for the rewriter). |
| RAG-if-outgrows | RAG / embeddings retrieval if the curated knowledge layer outgrows model context. |

### Phase-15 banked items (open)
| Id | Item |
|---|---|
| B-15.1 | Snow service-log capture RUNTIME — fill `snow_service_logs` per dispatch (field/mobile execution surface). |
| B-15.2 | Live weather feed + auto-event-trigger (calls the same `declareSnowEvent` seam). |
| B-15.3 | Mass-op operator UI + snow operator screens. |
| B-15.4 | Snow dashboard read surface. |
| CF-15.1 | `spawned_count`/`skipped_count` columns on `snow_events`. |

### Inherited bank (from the Phase-15 roll-forward)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — gated on accumulated review-confirm data + §2.5 relaxation. |
| CF-13.2 | Live email receiver (IMAP/webhook/mailbox polling). |
| CF-13.3 | Real deterministic + AI email extractor logic. |
| CF-13.4 | Email attachment physical-storage backend. |
| CF-13.5 | Email→client resolution column (`external_system_id` on `email_ingestion_accounts`). |
| CF-13.6 | Email approve→link orphan window (source_external_id reader guard). |
| CF-13.7 | Operator email review-queue UI (+ AI-assist invocation surface). |
| CF-12.1 | Full-workflow auto-push (job change → mapped external platform). |
| CF-12.2 | Live external adapter (real fetch/push HTTP). |
| CF-12.3 | Operator mapping UIs (external_*_mappings management). |
| CF-12.4 | Credential encryption-at-rest. |
| CF-12.5 | External-ingest IF-4 orphan window. |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–15). |
| FB-10a.1 | Vendor/client invite & onboarding flow. |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`). |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture. |

### Inherited Phase-14 banked items (still open — roll forward)
| Id | Item |
|---|---|
| B-14.1 | PM Programs UI placement (dedicated section + client-profile read list). |
| B-14.2 | Live cron / scheduler trigger (timer calling `runDueSchedules`). |
| B-14.3 | Per-location scope/trade override on a PM membership. |
| B-14.4 | Mass-dispatch + generic mass-update UI (operator-portal). |
| B-14.5 | `pm_assets` lightweight cap (explicit scope cap, not EAM). |
| CF-14.1 | PM checklist result instantiation (`pm_visit_results` per visit from the template). |
| CF-14.2 | Operator authz gate on `approvePmVisits` (action wrapper). |
| CF-14.3 | PM program/schedule CRUD UI. |

## Standing watchpoints (carried forward)

- **pnpm not npm** (an `npm install` crashes npm's arborist against the pnpm `node_modules`).
- **Name the DB explicitly** (WP-12.1); **pre-name FKs >64 chars** (WP-12.2).
- **MariaDB-JSON parse-at-read**; read verdicts from a file + true exit.
- `inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2).
- `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only;
  better-auth NULL-tenant audit rows.
- **Snow naming care** — `snow_events` (storm batch header) ≠ `job_events`; `snow_dispatches`
  (per-site spawn/outcome) is NOT a vendor-assignment table.
- **drizzle forward-FK ordering** — a referenced table must be declared before the table whose
  FK callback references it.
- **Vendor updates live in `job_notes` (`origin='vendor'`)**, not `vendor_update_logs` (a dead
  forward-decl). (Phase-18 finding.)
