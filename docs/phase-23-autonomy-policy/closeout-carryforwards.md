# Phase 23 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-22-dispatch-engine/closeout-carryforwards.md`, with the new Phase-23 items added.
**Phase 23 RETIRES NOTHING** — it is a build phase (net-new autonomy governance); the **entire
inherited bank rolls forward UNCHANGED**. Verified against the live Phase-22 bank text — no inherited
backlog item was delivered by Phase 23, so no retirement or discharge is claimed. (CF-21.1 was
already discharged in the Phase-22 cycle @ `76c5252`; it remains recorded as discharged in the
inherited Phase-21 row below.)

## Phase-23 delivery against the Phase-22 forward-pointer (status update — NOT a retirement)

The Phase-22 soft note read: *"The auto-picker has NO trigger… **Phase 23** (autonomy policy engine
+ guardrails) governs **WHEN** it runs and whether a DRAFT may auto-advance to SENT."* Phase 23
delivered **the governance half**: the per-agent on/off + kill-switch resolver, the token + dollar
guardrails, the enforcement branch (`auto_executed` / `policy_blocked`), and the DRAFT→SENT
auto-advance mechanism (`sendDispatch` NULL system actor). **The LIVE TRIGGER is NOT delivered** —
`autoDispatchDraftForJob` is still invoked by nothing in app code (only the harness). The trigger +
first real-tenant enablement move to **Phase 24** (observability-gated, §2.3). This is a status
update on a forward-pointer soft note, **not** a CF retirement.

## Discharged since the last bank (Phase 23) — NONE

**Phase 23 itself discharged nothing** — it built the net-new autonomy policy engine + guardrail
layer; no inherited backlog item was delivered. (No `agent_policies` autonomy fields, kill switch,
or guardrail metering existed before this phase to discharge against.)

## New Phase-23 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-23.1** | **Tenant-supplied LLM API keys + self-service AI restrictions in Settings** — a tenant providing its own provider key and setting its own AI-usage limits/agent restrictions from a Settings surface. | Per-tenant **encrypted key storage** (a new security surface) + a **multi-provider** wiring to consume tenant keys + a Settings UI. The *limits* have a natural home in `tenant_autonomy_settings`; the *key storage* does not yet exist. "Other agent restrictions" beyond on/off = the **Phase-28 condition vocabulary**. | Depends on **Phase-24 multi-provider** wiring and **credential encryption-at-rest (CF-12.4)**. *(Note: the 23h handoff referenced "CF-12.1 encryption"; the live bank's encryption item is **CF-12.4** — CF-12.1 is "Full-workflow auto-push." Live bank wins.)* |
| **CF-23.2** | **Dollar-meter aggregation optimization** — `tenantCommittedAllTime` / `withinSpendCeilings` resolve `getEffectiveNte` **once per committed job** (Big.js reduce; no SQL aggregate, no accumulator). The **per-tenant lifetime axis** is O(N) over all-time autonomy commits. | A bounded query or a (carefully-invalidated) cached/materialized committed total, if autonomy volume grows. Keep the no-float money discipline. | Fine at current scale (≈zero autonomy volume — no live trigger). Premature to optimize before Phase-24 enablement; flagged for when real volume lands. |

**Soft notes (open, low-priority):**
- **`autonomyEnabled`-naming clarity.** `ResolvedPolicy.autonomyEnabled` reflects only the **policy +
  kill-switch** halves; the full "may this action fire" answer ANDs `withinTokenCeilings().ok &&
  withinSpendCeilings().ok` at the **enforcement site** (`autoDispatchDraftForJob`), by design (don't
  fold spend metering into the Phase-7 resolver). The field name alone does not mean "fully
  permitted" — a rename or a derived `fullyPermitted()` helper could clarify if it ever confuses.
- **Rolling-24h vs calendar-day window.** "Per-day" everywhere is a rolling trailing 24h
  (`NOW() - INTERVAL 1 DAY`, DB-computed) — matching house "now − duration" style and dodging the
  absent tenant timezone. If a **calendar-day** boundary (tenant-local midnight reset) is ever wanted,
  it is a net-new convention (needs a tenant tz; only `clients.timezone` exists today, for SLA hours).

## §9 operator-portal-UI bucket — unfulfilled for the 23-portion (rolls forward OPEN)

Roadmap §9 lists `B-14.1 / B-14.3 / B-14.4 / B-15.3 / CF-14.3` under "Retired by v2 phases … (Phases
18/22/28 **as the surfaces land**)." Phase 23 built the autonomy policy engine + guardrails — **not**
the PM/snow/mass-op operator UIs those items name. They remain **unfulfilled for the 23-portion** and
roll forward OPEN. Because §9's wording is **conditional** ("as the surfaces land"), this is **not** a
false flat retirement claim — **no doc-correction CF is opened**; the standing §6/§9 over-attribution
watchpoint carries forward.

---

## Inherited (roll forward, UNCHANGED — from the Phase-22 bank)

### Phase-22 banked items (open)
| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-22.1** | **Rich service-area coverage model** — geographic matching is **equality-only** today (national/state/city/postal); `radius` and `county` `vendor_service_areas` rows are **stored but inert**. | Client-location **geocoding** + a **distance predicate** (to activate radius); and/or polygon coverage, manual map-drawing, prior-service-history representations. | A known-hard model with no single graceful representation; Phase 22 builds the floor against the equality geo that exists. **Relates to the 17a geo gap** (no `client_locations` lat/long). |
| **CF-22.2** | **Client-level default preferred vendor** — `location_preferred_vendors` is per-location-per-trade (the shipped grain); a client-level default (one row covering all a client's locations for a trade) is not supported. | A nullable-location preferred row (mirroring the blocklist) **plus precedence-resolution** so a location-specific row overrides a client default — more than the leading sort key shipped. | Per-location-per-trade is the locked D1 grain; the client-default's precedence logic is beyond Tier-1/2 scope. |
| **CF-22.3** | **Client-wide-ban authoring UI + preferred/blocklist management-screen polish** — the matcher **honors** client-wide block rows (`location_blocked_vendors` with NULL `client_location_id`), but the operator surface only authors **location-scoped** blocks; the shipped sections are basic list + add-form + remove. | A client-detail-page surface to author/clear a client-wide ban (the NULL-location row), and a fuller management screen for both tables. | Location-scoped authoring covers the primary "manager bars at my store" case; client-wide authoring + polish deferred to keep the slice tight. |

**Phase-22 soft notes (open, low-priority):**
- **The auto-picker trigger — now Phase 24** (was "Phase 23's job"). Phase 23 delivered the
  governance + auto-advance + guardrails; the **live trigger** that invokes `autoDispatchDraftForJob`
  (and first real-tenant enablement) is **Phase 24**, observability-gated (§2.3). Still by design, not
  an unfinished feature. (See the Phase-23 delivery note above.)
- **Compliance floor is fail-open-with-flag — TEMPORARY (Phase-5 D-5.2).** With `vendor_compliance`
  empty, an absent compliance row is `no_data` = eligible-but-recorded (snapshotted at dispatch); the
  auto-dispatch path stays at DRAFT. When compliance data lands, the exclude predicate tightens to a
  hard "compliant required" gate with **no schema change** (it already keys on `compliance_status`).
- **`location_blocked_vendors` accumulates archived history** — re-block-after-unblock inserts a fresh
  active row (the `client_nte_rules` no-unique soft-delete model); a row-pruning policy is not built
  (not blocking).

### Phase-21 banked items (open)
| Id | Item |
|---|---|
| ~~CF-21.1~~ | **DISCHARGED @ `76c5252`** (roadmap §6/§9 B-16.3 correction landed; B-16.3 stays OPEN). Discharged in the Phase-22 cycle; recorded here as history. |
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
| B-16.3 | Chat UI + vendor-direction publish target. **Stays OPEN** — neither half built; magic-link send (Phase 21) only **partially unblocks** the vendor-direction outbound channel. (CF-21.1, the doc-correction, is discharged; the **feature** B-16.3 remains.) |
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
| B-15.3 | Mass-op operator UI + snow operator screens. *(§9 "Phases 18/22/28" bucket — unfulfilled by Phases 22/23.)* |
| B-15.4 | Snow dashboard read surface. |
| CF-15.1 | `spawned_count`/`skipped_count` columns on `snow_events`. |

### Inherited bank (from the Phase-15 roll-forward)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — gated on accumulated review-confirm data + §2.5 relaxation. **(Distinct from Phase-23 dispatch autonomy — email auto-create is unbuilt; stays OPEN.)** |
| CF-13.2 | Live email receiver (IMAP/webhook/mailbox polling). |
| CF-13.3 | Real deterministic + AI email extractor logic. |
| CF-13.4 | Email attachment physical-storage backend (`email_attachments.storage_ref`). **Partially unblocked** by the Phase-20 R2 seam; still OPEN. |
| CF-13.5 | Email→client resolution column (`external_system_id` on `email_ingestion_accounts`). |
| CF-13.6 | Email approve→link orphan window (source_external_id reader guard). |
| CF-13.7 | Operator email review-queue UI (+ AI-assist invocation surface). |
| CF-12.1 | Full-workflow auto-push (job change → mapped external platform). |
| CF-12.2 | Live external adapter (real fetch/push HTTP). |
| CF-12.3 | Operator mapping UIs (`external_*_mappings` management). |
| CF-12.4 | Credential encryption-at-rest. **(CF-23.1 tenant-API-key storage depends on this.)** |
| CF-12.5 | External-ingest IF-4 orphan window. |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–15). |
| FB-10a.1 | Vendor/client invite & onboarding flow. *(CF-21.2 — the linkless→registered bridge — relates here.)* |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`). |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture. |

### Inherited Phase-14 banked items (still open — roll forward)
| Id | Item |
|---|---|
| B-14.1 | PM Programs UI placement (dedicated section + client-profile read list). *(§9 "Phases 18/22/28" bucket — unfulfilled by Phases 22/23.)* |
| B-14.2 | Live cron / scheduler trigger (timer calling `runDueSchedules`). |
| B-14.3 | Per-location scope/trade override on a PM membership. *(§9 bucket — unfulfilled by Phases 22/23.)* |
| B-14.4 | Mass-dispatch + generic mass-update UI (operator-portal). *(§9 bucket — unfulfilled by Phases 22/23; the per-location preferred/blocklist surface is NOT this.)* |
| B-14.5 | `pm_assets` lightweight cap (explicit scope cap, not EAM). |
| CF-14.1 | PM checklist result instantiation (`pm_visit_results` per visit from the template). |
| CF-14.2 | Operator authz gate on `approvePmVisits` (action wrapper). |
| CF-14.3 | PM program/schedule CRUD UI. *(§9 "Phases 18/22/28" bucket — unfulfilled by Phases 22/23.)* |

## Standing watchpoints (carried forward)

- **pnpm not npm** (an `npm install` crashes npm's arborist against the pnpm `node_modules`).
- **Name the DB explicitly** (WP-12.1); **pre-name FKs >64 chars** (WP-12.2 — applied to `lpv_location_fk` / `lbv_location_fk` in 0045; `tas_tenant_fk` in 0046).
- **MariaDB-JSON parse-at-read** — `json()` columns come back as strings; parse at the read boundary
  (hit again in the Phase-23 harness reading `agent_decisions.metadata`). Read verdicts from a file + true exit.
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
  resolved DB name before any prod DDL. (Re-confirmed on 0046 + the `dispatch_router_v1` prod seed.)
- **Storage seam is capture-by-default** (`R2_*` for real R2; `STORAGE_FORCE_FAIL` test-only).
- **Send seam is capture-by-default** (`RESEND_*` for real email; `SEND_CAPTURE=1` forces capture);
  **`APP_URL`** is the magic-link base — wrong/unset = dead links.
- **Never store/log the raw magic-link token** — only its `sha256`.
- **Harness teardown under `FK_CHECKS=0` does NOT cascade** — deleting a parent (e.g. a tenant) row with
  foreign-key checks off leaves children orphaned; delete children explicitly by id, or track them.
  (Phase-22 finding; re-applied in the Phase-23 harness — every child row deleted by tracked id, and
  **never delete `audit_logs` by a Date/timestamp window** — JS-Date-vs-DB-timezone skew misses rows.)
- **Two-NULLs rule (Phase-23, for future meter work)** — a NULL *cap* is **permissive** (skip/within);
  a NULL *measurement* (e.g. `getEffectiveNte` → null) is **restrictive** (block). Different nulls,
  opposite safe directions — preserve this when extending guardrails (the dollar sibling for a token
  cap, etc.).
- **`agent_decisions` requires a synthetic `agent_runs` row (Phase-23)** — `agent_run_id` is NOT NULL
  with no direct `agent_id`; a rule-based agent that wants an `auto_executed`/`policy_blocked` decision
  row must `openRun` first (token columns NULL — never pollutes the token meter).
- **Phase-22 ledger ↔ Phase-23 vocabulary lineage** — `check-phase-22.ts` was edited (`drafted` →
  `drafted_pending`, 3 assertions) when the governed `AutoDispatchResult` removed the bare `"drafted"`.
  A Phase-22 ledger assertion now depends on a Phase-23 vocabulary change; the DRAFT-GATE invariant is
  unchanged. Recorded so it is not mistaken for a regression.
- **Roadmap §6/§9 over-attribute retirements** — CF-19.4 (CF-12), CF-20.3 (CF-13.4), CF-21.1 (B-16.3 —
  discharged) are the running list of §6/§9 retirement claims unsupported by the live bank. The §9
  "Phases 18/22/28" operator-UI bucket (B-14.1/14.3/14.4/B-15.3/CF-14.3) is a **conditional** ("as the
  surfaces land") variant — unfulfilled by Phases 22/23, no correction needed, but watch it as those
  phases land. The 23h handoff's "CF-12.1 encryption" reference (the encryption item is **CF-12.4**) is
  a fresh instance of reference-care: **verify any "retires/depends-on X" claim against the live bank
  text before acting on it** (live bank wins over roadmap §6/§9 and over handoff prose).
