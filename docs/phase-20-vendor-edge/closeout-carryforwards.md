# Phase 20 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-19-notifications-send/closeout-carryforwards.md`, with the Phase-20 discharge recorded and the
new Phase-20 items added. **The entire inherited bank rolls forward UNCHANGED — including CF-13.4, which
Phase 20 did NOT retire (see the disposition note below).**

## Discharged this phase (verified — NOT carry-forward)

| Item | Evidence | Source of record / note |
|---|---|---|
| **FB-10a.4 — Real photo upload backend** (storage provider + signed URLs + validation) | storage seam (`src/lib/integrations/storage/`) + `createVendorPhotoPlaceholder` file branch + `getVendorAttachmentUrl`; harness groups 1 (upload) + 5 (write-boundary) | **Phase-10 §A.2** (vendor-portal) is the definitional home ("deferred indefinitely"; not in the recent roll-forward). **Note:** the obligation's *"backfill `file_url`/size/mime on existing placeholder rows"* sub-clause was **out of scope** — existing placeholders stay placeholders; only new uploads carry bytes. |
| **Real-bytes object storage seam** — R2 behind a `StorageProvider` (capture-by-default; R2 never built without creds) | harness 1c (provider='capture'), 3a/4a/4c (scope), 5a–5c (integrity + put-before-insert) | — |
| **Migration 0043** — `job_attachments` += storage_key/checksum/storage_provider (additive), sandbox→prod verified | `e025161`; ledger 0043; table count 115 | second v2 migration |

> **Disposition note — CF-13.4 is NOT retired.** The v2 roadmap (§6 line ~107 and §9 line ~167) states
> "Retires CF-13.4 (Phase 20)." **This is wrong.** Per the live bank, **CF-13.4 is the _email_ attachment
> backend** — *"where `email_attachments.storage_ref` bytes live"* (Phase-13 source-of-record), part of
> the email-ingestion track, **untouched by Phase 20**. The vendor-photo backend Phase 20 built was
> **FB-10a.4** (retired above). CF-13.4 therefore **rolls forward open** below; its stated blocker
> (*"no blob backend pattern in the platform yet"*) is now **partially discharged** — the reusable R2
> `StorageProvider` seam exists, and email ingestion needs only to wire `email_attachments.storage_ref`
> to it. The roadmap text needs a separate doc-fix — tracked as **CF-20.3** (analogous to CF-19.4).

## New Phase-20 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-20.1** | **Operator-side attachment reader + photo viewing** — operators cannot view vendor-uploaded photos in the aggregator portal (only the uploading vendor's scope can). | A tenant-scoped operator reader + an operator permission gate (NOT vendor author-scope) + a viewing surface, presigning via the same seam. | No operator attachment reader/gate exists today (4A); net-new, out of the vendor-edge scope. |
| **CF-20.2** | **Orphan-object sweep** — a put that succeeds followed by a failed DB insert leaves an unreferenced object in R2. | A reconciliation/sweep job (storage keys ↔ `job_attachments.storage_key`) or a transactional-outbox pattern. | The common failure (put fails) writes no row (harness 5c); the reverse is rare; sweep is hygiene, not blocking. |
| **CF-20.3** | **Roadmap §6/§9 CF-13.4 doc-correction** — both sections wrongly claim "Retires CF-13.4 (Phase 20)," conflating CF-13.4 (email_attachments backend) with FB-10a.4 (vendor photos, the item actually retired). | A gated edit to `02-gpt-project-roadmap-v2.md` §6 + §9 (record FB-10a.4 as the Phase-20 retirement; keep CF-13.4 open, noting it's partially unblocked). | A roadmap doc-fix, separate from this phase; not edited here (matches CF-19.4 handling). |

**Soft notes (open, low-priority):**
- **`vendor_documents` could reuse the storage adapter** — it shares the NULL-`file_url` placeholder
  pattern (insurance certs, W-9s, licenses); a later phase can route it through the same `StorageProvider`.
- **FB-10a.4 legacy-placeholder backfill not performed** — existing NULL-file `job_attachments` rows stay
  placeholders; a one-off backfill (set storage_key/size/mime) was out of scope.

## Inherited (roll forward, UNCHANGED — from the Phase-19 bank)

### Phase-19 banked items (open)
| Id | Item |
|---|---|
| CF-19.1 | Business-hours-aware SLA/escalation clock (elapsed-business-hours over `client_location_hours` + `client_locations.timezone`). |
| CF-19.2 | Twilio SMS adapter (a second `SendProvider` impl). |
| CF-19.3 | No-same-day-on-site exception (blocked on CF-19.1). |
| CF-19.4 | Roadmap §9 CF-12 doc-correction (the non-existent "CF-12.x outbound send" + scrambled CF-12.1/CF-12.4 labels). |
| — (soft) | `change_orders.submitted_at` proxy (`nte_increase_requested` sorts by `updated_at`). |
| — (soft) | Resend `Idempotency-Key` vs `failed→sent` retry — verify at live-key wiring. |

### Phase-18 banked items (open)
| Id | Item |
|---|---|
| CF-18.1 | Queue original-source note — the cross-job draft queue omits the originating note body; operators click through to the job. |
| CF-18.2 | `(tenant_id, origin)` index on `job_notes` — `listVendorUpdates` does a tenant-prefix scan filtered on `origin`. |

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
| CF-13.4 | Email attachment physical-storage backend (`email_attachments.storage_ref`). **Partially unblocked** by the Phase-20 R2 `StorageProvider` seam — email ingestion needs only to wire it; still OPEN. |
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
- **Migration cadence** — sandbox apply → `-E` contract-verify → prod-confirm gate → prod apply; a
  pre-set shell `DATABASE_URL` survives drizzle-kit's env load (dotenv non-override) — confirm the
  resolved DB name before any prod DDL. (Phase-19 finding.)
- **Roadmap §9 needs the CF-12 correction (CF-19.4)**; **roadmap §6/§9 need the CF-13.4 correction
  (CF-20.3)** — both wrongly attribute retirements (CF-13.4 is the email backend, still open; the
  vendor-photo backend was FB-10a.4).
- **Storage seam is capture-by-default** — real R2 needs the four `R2_*` env vars; `STORAGE_FORCE_FAIL`
  is a test-only capture hook, never set in production. (Phase-20 finding.)
