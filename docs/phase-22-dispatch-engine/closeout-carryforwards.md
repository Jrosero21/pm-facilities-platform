# Phase 22 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-21-magic-link/closeout-carryforwards.md`, with the new Phase-22 items added. **Phase 22
RETIRES NOTHING** — it is a pure build phase; the **entire inherited bank rolls forward UNCHANGED**,
**except CF-21.1, which is now DISCHARGED** (the roadmap §6/§9 B-16.3 correction landed at `76c5252`,
the Phase-22 branch point; **B-16.3 itself stays OPEN**).

## Discharged since the last bank (verified — NOT carry-forward)

- **CF-21.1 — DISCHARGED @ `76c5252`.** The roadmap §6/§9 "retires B-16.3 (Phase 21)" over-attribution
  was corrected on `main` just before this branch: §6 (line ~115) now reads *"Does NOT retire B-16.3 —
  its operator chat UI and rewrite-draft vendor-publish path both remain unbuilt,"* and §9's retired-list
  no longer includes B-16.3 (verified against the live roadmap). **B-16.3 stays OPEN** (rolled forward
  below) — only the doc-correction obligation (CF-21.1) is discharged. The standing §6/§9
  over-attribution watchpoint persists.

**Phase 22 itself discharged nothing** — it built net-new dispatch routing; no inherited backlog item
was delivered.

## New Phase-22 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-22.1** | **Rich service-area coverage model** — geographic matching is **equality-only** today (national/state/city/postal); `radius` and `county` `vendor_service_areas` rows are **stored but inert**. | Client-location **geocoding** + a **distance predicate** (to activate radius); and/or polygon coverage, manual map-drawing, prior-service-history representations. | A known-hard model with no single graceful representation; Phase 22 builds the floor against the equality geo that exists. **Relates to the 17a geo gap** (no `client_locations` lat/long). |
| **CF-22.2** | **Client-level default preferred vendor** — `location_preferred_vendors` is per-location-per-trade (the shipped grain); a client-level default (one row covering all a client's locations for a trade) is not supported. | A nullable-location preferred row (mirroring the blocklist) **plus precedence-resolution** so a location-specific row overrides a client default — more than the leading sort key shipped. | Per-location-per-trade is the locked D1 grain; the client-default's precedence logic is beyond Tier-1/2 scope. |
| **CF-22.3** | **Client-wide-ban authoring UI + preferred/blocklist management-screen polish** — the matcher **honors** client-wide block rows (`location_blocked_vendors` with NULL `client_location_id`), but the operator surface only authors **location-scoped** blocks; the shipped sections are basic list + add-form + remove. | A client-detail-page surface to author/clear a client-wide ban (the NULL-location row), and a fuller management screen for both tables. | Location-scoped authoring covers the primary "manager bars at my store" case; client-wide authoring + polish deferred to keep the slice tight. |

**Soft notes (open, low-priority):**
- **The auto-picker has NO trigger — by design, not a deferral.** `autoDispatchDraftForJob` is a callable
  mechanism that creates a DRAFT and stops; nothing auto-invokes it, and it cannot auto-send. **Phase 23**
  (autonomy policy engine + guardrails) governs **WHEN** it runs and whether a DRAFT may auto-advance to
  SENT. This is gate-ability (invariant 4/5 prep), explicitly the next phase's job — not an unfinished
  feature here.
- **Compliance floor is fail-open-with-flag — TEMPORARY (Phase-5 D-5.2).** With `vendor_compliance`
  empty, an absent compliance row is `no_data` = eligible-but-recorded (snapshotted at dispatch); the
  auto-dispatch path stays at DRAFT. When compliance data lands, the exclude predicate tightens to a hard
  "compliant required" gate with **no schema change** (it already keys on `compliance_status`).
- **`location_blocked_vendors` accumulates archived history** — re-block-after-unblock inserts a fresh
  active row (the `client_nte_rules` no-unique soft-delete model); a row-pruning policy is not built (not
  blocking).

## §9 operator-portal-UI bucket — unfulfilled for the 22-portion (rolls forward OPEN)

Roadmap §9 lists `B-14.1 / B-14.3 / B-14.4 / B-15.3 / CF-14.3` under "Retired by v2 phases … (Phases
18/22/28 **as the surfaces land**)." Phase 22 built dispatch routing + a small per-location
preferred/blocklist surface — **not** the PM/snow/mass-op operator UIs those items name. They are
**unfulfilled for the 22-portion** and roll forward OPEN (see the Phase-14/15 sections below). Because
§9's wording is **conditional** ("as the surfaces land"), this is **not** a false flat retirement claim
(unlike CF-19.4 / CF-20.3 / CF-21.1) — **no doc-correction CF is opened**; the standing §6/§9
over-attribution watchpoint carries forward.

## Inherited (roll forward, UNCHANGED — from the Phase-21 bank)

### Phase-21 banked items (open)
| Id | Item |
|---|---|
| ~~CF-21.1~~ | **DISCHARGED @ `76c5252`** (roadmap §6/§9 B-16.3 correction landed; B-16.3 stays OPEN). See above. |
| CF-21.2 | Vendor account-claim / onboarding from linkless usage — the **linkless→registered bridge** (on account creation, link to the existing `vendor_id` so prior linkless jobs/notes/photos consolidate). Relates **FB-10a.1**. |
| CF-21.3 *(soft)* | Mint-new-per-send token accumulation — a pruning/retention policy if row growth matters (by design; low priority). |
| CF-21.4 *(soft)* | SMS link delivery — a second `SendProvider` (e.g. Twilio) behind the Phase-19 send seam + a phone recipient. Relates **CF-19.2**. |

**Phase-21 soft notes (open):** `APP_URL` is a deploy-time var (wrong/unset = dead links); presigned-URL
issuance window outlives revocation (~5 min, inherited Phase 20); 7-day token expiry is a fixed constant.

### Phase-20 banked items (open)
| Id | Item |
|---|---|
| CF-20.1 | Operator-side attachment reader + photo viewing (tenant-scoped reader + operator permission gate; presign via the same seam). |
| CF-20.2 | Orphan-object sweep (storage keys ↔ `job_attachments.storage_key`, or a transactional-outbox) for the put-succeeds-then-insert-fails residue. |
| CF-20.3 | Roadmap §6/§9 CF-13.4 doc-correction (conflated CF-13.4 email-attachments backend with FB-10a.4 vendor photos). |
| — (soft) | `vendor_documents` could reuse the storage adapter (insurance certs, W-9s, licenses). |
| — (soft) | FB-10a.4 legacy-placeholder backfill not performed. |

### Phase-19 banked items (open)
| Id | Item |
|---|---|
| CF-19.1 | Business-hours-aware SLA/escalation clock (elapsed-business-hours over `client_location_hours` + `client_locations.timezone`). |
| CF-19.2 | Twilio SMS adapter (a second `SendProvider`). |
| CF-19.3 | No-same-day-on-site exception (blocked on CF-19.1). |
| CF-19.4 | Roadmap §9 CF-12 doc-correction (non-existent "CF-12.x outbound send" + scrambled CF-12.1/12.4 labels). |
| — (soft) | `change_orders.submitted_at` proxy; Resend `Idempotency-Key` vs `failed→sent` retry — verify at live-key wiring. |

### Phase-18 banked items (open)
| Id | Item |
|---|---|
| CF-18.1 | Queue original-source note (the cross-job draft queue omits the originating note body). |
| CF-18.2 | `(tenant_id, origin)` index on `job_notes` (`listVendorUpdates` does a tenant-prefix scan). |

### Phase-16 banked items (open)
| Id | Item |
|---|---|
| B-16.3 | Chat UI + vendor-direction publish target. **Stays OPEN** — neither half built; magic-link send (Phase 21) only **partially unblocks** the vendor-direction outbound channel. (CF-21.1, the doc-correction, is now discharged; the **feature** B-16.3 remains.) |
| B-16.4 | Vendor performance reader + populate `vendor_performance_scores`. *(Tier-3 AI dispatch, Phase 27, is data-blocked on this.)* |
| B-16.5 | LLM-assisted draft phrasing (provider seam + `ai_prompt_templates`). |
| CF-16.1 | `source_type` intent-tag enum value on `update_rewrite_drafts`. |
| CF-16.2 | Invoice-aging anomaly rule (extend `flagInvoiceAnomalies`). |
| CF-16.3 | `source_id` polymorphic-meaning doc. |
| RAG-if-outgrows | RAG / embeddings retrieval if the curated knowledge layer outgrows model context. |

### Phase-15 banked items (open)
| Id | Item |
|---|---|
| B-15.1 | Snow service-log capture RUNTIME (`snow_service_logs` per dispatch). |
| B-15.2 | Live weather feed + auto-event-trigger. |
| B-15.3 | Mass-op operator UI + snow operator screens. *(§9 "Phases 18/22/28" bucket — unfulfilled by Phase 22.)* |
| B-15.4 | Snow dashboard read surface. |
| CF-15.1 | `spawned_count`/`skipped_count` columns on `snow_events`. |

### Inherited bank (from the Phase-15 roll-forward)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — gated on accumulated review-confirm data + §2.5 relaxation. |
| CF-13.2 | Live email receiver (IMAP/webhook/mailbox polling). |
| CF-13.3 | Real deterministic + AI email extractor logic. |
| CF-13.4 | Email attachment physical-storage backend (`email_attachments.storage_ref`). **Partially unblocked** by the Phase-20 R2 seam; still OPEN. |
| CF-13.5 | Email→client resolution column (`external_system_id` on `email_ingestion_accounts`). |
| CF-13.6 | Email approve→link orphan window (source_external_id reader guard). |
| CF-13.7 | Operator email review-queue UI (+ AI-assist invocation surface). |
| CF-12.1 | Full-workflow auto-push (job change → mapped external platform). |
| CF-12.2 | Live external adapter (real fetch/push HTTP). |
| CF-12.3 | Operator mapping UIs (`external_*_mappings` management). |
| CF-12.4 | Credential encryption-at-rest. |
| CF-12.5 | External-ingest IF-4 orphan window. |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–15). |
| FB-10a.1 | Vendor/client invite & onboarding flow. *(CF-21.2 — the linkless→registered bridge — relates here.)* |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`). |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture. |

### Inherited Phase-14 banked items (still open — roll forward)
| Id | Item |
|---|---|
| B-14.1 | PM Programs UI placement (dedicated section + client-profile read list). *(§9 "Phases 18/22/28" bucket — unfulfilled by Phase 22.)* |
| B-14.2 | Live cron / scheduler trigger (timer calling `runDueSchedules`). |
| B-14.3 | Per-location scope/trade override on a PM membership. *(§9 bucket — unfulfilled by Phase 22.)* |
| B-14.4 | Mass-dispatch + generic mass-update UI (operator-portal). *(§9 bucket — unfulfilled by Phase 22; the per-location preferred/blocklist surface is NOT this.)* |
| B-14.5 | `pm_assets` lightweight cap (explicit scope cap, not EAM). |
| CF-14.1 | PM checklist result instantiation (`pm_visit_results` per visit from the template). |
| CF-14.2 | Operator authz gate on `approvePmVisits` (action wrapper). |
| CF-14.3 | PM program/schedule CRUD UI. *(§9 "Phases 18/22/28" bucket — unfulfilled by Phase 22.)* |

## Standing watchpoints (carried forward)

- **pnpm not npm** (an `npm install` crashes npm's arborist against the pnpm `node_modules`).
- **Name the DB explicitly** (WP-12.1); **pre-name FKs >64 chars** (WP-12.2 — applied to `lpv_location_fk` / `lbv_location_fk` in 0045).
- **MariaDB-JSON parse-at-read** — `json()` columns come back as strings; parse at the read boundary
  (hit again in the Phase-22 harness reading `audit_logs.metadata`). Read verdicts from a file + true exit.
- `inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2).
- `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only;
  better-auth NULL-tenant audit rows.
- **Snow naming care** — `snow_events` (storm batch header) ≠ `job_events`; `snow_dispatches` is NOT a
  vendor-assignment table.
- **drizzle forward-FK ordering** — a referenced table must be declared before the table whose FK
  callback references it.
- **Vendor updates live in `job_notes` (`origin='vendor'`)**, not `vendor_update_logs`.
- **Migration cadence** — sandbox apply → `-E` contract-verify → prod-confirm gate → prod apply; a
  pre-set shell `DATABASE_URL` survives drizzle-kit's env load (dotenv non-override) — confirm the
  resolved DB name before any prod DDL.
- **Storage seam is capture-by-default** (`R2_*` for real R2; `STORAGE_FORCE_FAIL` test-only).
- **Send seam is capture-by-default** (`RESEND_*` for real email; `SEND_CAPTURE=1` forces capture);
  **`APP_URL`** is the magic-link base — wrong/unset = dead links.
- **Never store/log the raw magic-link token** — only its `sha256`.
- **Harness teardown under `FK_CHECKS=0` does NOT cascade** — deleting a parent (e.g. a tenant) row with
  foreign-key checks off leaves children orphaned; delete children explicitly by id, or track them.
  (Phase-22 harness finding.)
- **Roadmap §6/§9 over-attribute retirements** — CF-19.4 (CF-12), CF-20.3 (CF-13.4), CF-21.1 (B-16.3 —
  **now discharged**) are the running list of §6/§9 retirement claims unsupported by the live bank. The
  §9 "Phases 18/22/28" operator-UI bucket (B-14.1/14.3/14.4/B-15.3/CF-14.3) is a **conditional** ("as the
  surfaces land") variant — unfulfilled by Phase 22, no correction needed, but watch it as those phases
  land. **Verify any "retires X" claim against the live bank text before acting on it** (live bank wins
  over roadmap §6/§9).
