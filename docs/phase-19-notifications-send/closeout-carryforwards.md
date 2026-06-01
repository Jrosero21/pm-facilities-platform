# Phase 19 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-18-operator-review-surfaces/closeout-carryforwards.md`, with the Phase-19 discharges recorded
and the new Phase-19 items added. **The entire inherited bank — including the CF-12.x external-platform
track — rolls forward UNCHANGED.**

## Discharged this phase (verified — NOT carry-forward)

| Item | Evidence | Note |
|---|---|---|
| **Live email send backend** — replaces the manual-status-flip; Resend behind `SendProvider`, capture-by-default | harness A1–A9 (send path) + C1–C3 (capture-honesty); `sendCommunication`; `ResendProvider` | This was **never a numbered CF item** — it is the discharge of the 17a/roadmap-§6 "no live send provider / Send is a manual status flip" gap. **NOT** a CF-12.x retirement (see the §9 correction below). |
| **Idempotency on send writes (§2.6)** — provider_message_id short-circuit + transition guard + Resend Idempotency-Key | harness B1–B4 (double-fire captures exactly once; failed→sent retries) | — |
| **Exception detection surface** — `getExceptions` (vendor-not-accepted / NTE-increase / filtered operational) | harness D1–D6; `/notifications` | — |
| **Migration 0042** — additive provider-tracking + timezone columns, sandbox→prod verified | `a2b7b0c`; ledger 0042; table count 115 | first v2 migration |

> **§9 correction (why no CF-12 was retired).** The v2 roadmap §9 listed a "CF-12.x outbound send"
> as retired by Phase 19. On inspection, **no such item exists**: every real CF-12 item (CF-12.1–12.5)
> is the **ServiceChannel external-platform integration** track, untouched by Phase 19. The email send
> backend Phase 19 built was never numbered. Therefore **CF-12.1–12.5 remain OPEN and roll forward
> verbatim below**, and the roadmap §9 text needs a separate doc-fix — tracked as **CF-19.4**.

## New Phase-19 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-19.1** | **Business-hours-aware SLA/escalation clock** — exception timing is currently wall-clock and can fire outside a location's business hours. | An elapsed-business-hours function over `client_location_hours` + `client_locations.timezone` (the column landed in 0042); rewire the exception/stall readers to use it. | Option B: wall-clock detection shipped; the TZ column is the seam, the clock logic is deferred. |
| **CF-19.2** | **Twilio SMS adapter** — a second `SendProvider` impl for SMS. | A `TwilioProvider` (the interface is already channel-agnostic) + recipient-phone wiring + factory branch. | Email-only MVP; the seam is SMS-ready. |
| **CF-19.3** | **No-same-day-on-site exception** — detect a dispatch with no on-site check-in by the same-day scheduled-start. | A reader over `vendor_check_ins` vs the resolved scheduled-start, business-hours-aware. | Blocked on CF-19.1 (the business-hours clock). |
| **CF-19.4** | **Roadmap §9 CF-12 doc-correction** — `02-gpt-project-roadmap-v2.md` §9 lists a non-existent "CF-12.x outbound send" as retired and swaps the CF-12.1/CF-12.4 labels vs the real bank. | A gated edit to the roadmap §9 (record Phase 19's send-backend discharge correctly; restore CF-12 labels; keep CF-12.1–12.5 open). | A roadmap doc-fix, separate from this phase; not edited here. |

**Soft notes (open, low-priority):**
- **`change_orders.submitted_at` proxy** — `nte_increase_requested` sorts by `updated_at` as a proxy for
  the submit time (no dedicated column; a precise timestamp lives in `change_order_approvals`).
- **Resend `Idempotency-Key` vs `failed→sent` retry** — verify the provider's idempotency window does not
  dedupe a legitimate retry of a row we recorded as `failed` (same `commId` key). Confirm at live-key wiring.

## Inherited (roll forward, UNCHANGED — from the Phase-18 bank)

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
- **Migration cadence** — sandbox apply → `-E` contract-verify → prod-confirm gate → prod apply; a
  pre-set shell `DATABASE_URL` survives drizzle-kit's env load (dotenv non-override) — confirm the
  resolved DB name before any prod DDL. (Phase-19 finding.)
- **Roadmap §9 needs the CF-12 correction (CF-19.4)** — §9 lists a non-existent "CF-12.x outbound send"
  as retired and scrambles the CF-12.1/CF-12.4 labels; the real CF-12.1–12.5 (external-platform track)
  are all still open.
