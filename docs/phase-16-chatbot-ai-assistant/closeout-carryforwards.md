# Phase 16 — Carry-Forwards (the canonical post-MVP backlog)

This is the **final** roadmap phase, so this file is the canonical post-MVP backlog: every
Phase-16-new item plus the full inherited bank rolled forward **verbatim** from
`docs/phase-15-snow-operations/closeout-carryforwards.md`.

## Discharged this phase (verified — NOT carry-forward)

| Item | Evidence |
|---|---|
| chatbot_assistant_v1 registered + runs through the shared runner | harness A0/D1, green @ `6c38c21` |
| Knowledge retrieval (curated layer) + citation; docs/-allowlisted path guard | harness A1/A2 + A-guard ×4 |
| 6 tenant-scoped operational reads composing existing readers (no new SQL) | harness B1, E1–E4 |
| Draft tools land pending_review via createRewriteDraft; agent has NO publish path | harness C1–C6 |
| AI actions logged to agent_* with correct read/write kinds | harness D2–D4 |
| Cross-tenant isolation (real T-B poison) | harness E1–E6 |
| Write-boundary: only update_rewrite_drafts grows; nothing published/sent | harness F1–F9 |
| ZERO new tables / ZERO migrations (WP-16.1 held) | table count 115; latest migration 0041 |

## New Phase-16 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **B-16.3** | **Chat UI + vendor-direction publish target** — the operator-facing conversational surface over the Phase-16 service layer, and an outbound publish target for `vendor_update`-sourced drafts (vendor-portal/communication spine). | The React/route surface + a vendor-direction publish path. | Engine is Phase 16; UI + publish-side defer to operator-portal (B-14.4/B-15.3 analog). |
| **B-16.4** | **Vendor performance reader + populate `vendor_performance_scores`** — a per-vendor activity/score reader so `summarizeVendorPerformance` returns real metrics. | The scoring computation + a reader; the table exists but is empty. | No reader existed; WP-16.1 forbade inventing query logic under "the assistant needs it." |
| **B-16.5** | **LLM-assisted draft phrasing** — replace deterministic draft text with LLM-generated prose via the wired provider seam + `ai_prompt_templates`. | The LLM call + a prompt template row for `chatbot_assistant_v1`. | Deterministic text kept the write path testable; phrasing is additive, doesn't change the gate. |
| **CF-16.1** | **`source_type` intent-tag enum value** on `update_rewrite_drafts` — optionally tag draft intent if a reader needs to distinguish chatbot- from rewriter-authored drafts beyond `agent_runs.agent_id`. | An enum ALTER (never a new table). | `agent_id` provenance suffices today. |
| **CF-16.2** | **Invoice-aging anomaly rule** — extend `flagInvoiceAnomalies` with a long-unpaid/aging signal. | A new metric/threshold over invoice dates. | Phase 16 scoped to rules A+B (margin<0, NTE breach); aging composes nothing existing. |
| **CF-16.3** | **`source_id` polymorphic-meaning doc** — record that `source_id`=jobId for assistant drafts vs a note/update row for the rewriter. | A short schema note. | Discovered at 16f binding; harmless today, worth documenting. |
| **RAG-if-outgrows** | **RAG / embeddings retrieval** — index the full docs tree if the curated `07-chatbot-knowledge.md` layer outgrows model context. | Embeddings table + ingestion + an embeddings provider. | The 878-line curated layer fits in context today (F16-A). |

## Inherited (roll forward, UNCHANGED — from the Phase-15 bank)

### New Phase-15 banked items (open)
| Id | Item |
|---|---|
| **B-15.1** | Snow service-log capture RUNTIME — fill `snow_service_logs` (serviced_at, photo_refs, gps, notes) per dispatch (the field/mobile execution surface). |
| **B-15.2** | Live weather feed + auto-event-trigger — evaluate `snow_service_triggers` against real observations to auto-declare (calls the same `declareSnowEvent` seam). |
| **B-15.3** | Mass-op operator UI + snow operator screens — program CRUD, the declare/confirm surface, batch operations + the `requireTenant`/`requireRole` action wrappers. |
| **B-15.4** | Snow dashboard read surface — a thin read over events/dispatches (counts, status, per-site outcome). |
| **CF-15.1** | `spawned_count`/`skipped_count` columns on `snow_events` — batch totals currently in `snow_event.dispatched` audit metadata only; add columns if a read surface needs queryable counts. |

### Inherited bank (from the Phase-15 roll-forward)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — the shared-helper seam PATTERN was applied again in Phase 15, but the email autonomy item itself stays open (gated on accumulated review-confirm data + §2.5 relaxation). |
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
| FB-10a.1/.3 | Operator vendor/client-updates inbox + invite/onboarding flow. |
| FB-10l.2/.3 | Visibility-promotion workflow; `requires_review` undefined. |
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
- **MariaDB-JSON parse-at-read**; read verdicts from a file + true exit (§10).
- `inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2).
- `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only;
  better-auth NULL-tenant audit rows.
- **Snow naming care** — `snow_events` (storm batch header) ≠ `job_events`; `snow_dispatches`
  (per-site spawn/outcome) is NOT a vendor-assignment table.
- **drizzle forward-FK ordering** — a referenced table must be declared before the table whose
  FK callback references it.
