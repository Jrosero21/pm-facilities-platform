# Phase 24 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-23-autonomy-policy/closeout-carryforwards.md`, with the new Phase-24 items added.
**Phase 24 RETIRES NOTHING** from the inherited bank — it is a build phase (observability +
multi-provider/failover + retention). Verified against the live Phase-23 bank text: no inherited
backlog item was *delivered* by Phase 24, so no retirement or discharge of an inherited item is
claimed. Two Phase-24-internal items change state (CF-24.1 resolved; CF-24.2 newly opened), and
one inherited item (CF-23.1) has a **dependency** partially satisfied without the item itself
closing — all detailed below.

## Discharged / resolved since the last bank (Phase 24)

- **CF-24.1 — RESOLVED @ `435441f`.** A `TS2393` "Duplicate function implementation" build-blocker.
  **Corrected story (the original 24d-B label was wrong — do NOT repeat it):** it was **NOT
  pre-existing**. It was **introduced by the 24d-B retention script** (`78b14d7`), which shipped as
  a bare global script (no `export {};`) — its top-level `main()` collided in the global TS scope
  with `scripts/check-external-integrations.ts`'s `main()`. Fixed at `435441f` by adding `export
  {};` (module isolation) to **both** harness scripts. The 24d-B report called it "pre-existing in
  check-external-integrations.ts"; that was a misdiagnosis — this closeout is the corrected record.
  (Lesson banked as a standing watchpoint below.)

**Phase 24 discharged no INHERITED backlog item** — it built net-new observability/provider/retention
surfaces; nothing from the prior bank was delivered.

## New Phase-24 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-24.2** | **Live autonomy trigger** — `autoDispatchDraftForJob` is invoked by nothing in app code; no job-creation hook / cron / queue calls it. The governed auto-dispatch (Phase 23) + the observability evidence (Phase 24) exist, but the trigger is unwired. | A deliberate decision + wiring to invoke `autoDispatchDraftForJob` (e.g. on job creation) for a **proven** agent on a **proven** tenant, informed by the `/agents` evidence; plus a first-tenant enablement (`autonomyEnabled:true` + cleared guardrails). | **§2.3 — permission ≠ readiness.** Phase 24 deliberately built the evidence surface and stopped short of flipping the switch. This is the forward-pointer the Phase-22/23 banks tracked ("auto-picker trigger — now Phase 24"); Phase 24 satisfied its *evidence* obligation and re-banks the *trigger* as a discrete future decision. |

**Phase-24 dependency note (NOT a retirement):**
- **CF-23.1's multi-provider-wiring dependency is now SATISFIED** — Phase 24 built the
  provider registry + direct-provider path + failover + per-policy preference. **CF-23.1 itself
  stays OPEN**: it still needs **tenant-supplied encrypted key storage (CF-12.4)** + a Settings UI;
  Phase 24 used the **platform's** env keys only. So CF-23.1 is rolled forward open, with one of its
  two dependencies discharged.

**Soft notes (open, low-priority — new this phase):**
- **OpenAI is built but dormant / not live-proven.** Failover is verified by logic (candidate-builder
  + retry predicate), not live traffic; real failover proves out only when `OPENAI_API_KEY` is set and
  a provider actually fails. Cost-map OpenAI price (`openai/gpt-5.4` $2.50/$15 per 1M) is third-party-
  sourced (Jun 2026) — confirm against OpenAI's official page at key-add; exact model is a one-line swap.

## §9 operator-portal-UI bucket — unfulfilled for the 24-portion (rolls forward OPEN)

Roadmap §9 lists `B-14.1 / B-14.3 / B-14.4 / B-15.3 / CF-14.3` under "Retired by v2 phases … (Phases
18/22/28 **as the surfaces land**)." Phase 24 built agent observability + multi-provider/retention —
**not** the PM/snow/mass-op operator UIs those items name. They remain **unfulfilled for the
24-portion** and roll forward OPEN. Because §9's wording is **conditional** ("as the surfaces land"),
this is **not** a false flat retirement claim — no doc-correction CF is opened; the standing §6/§9
over-attribution watchpoint carries forward.

---

## Inherited (roll forward, UNCHANGED — from the Phase-23 bank)

### Phase-23 banked items (open)
| Id | Item | Status |
|---|---|---|
| **CF-23.1** | **Tenant-supplied LLM API keys + self-service AI restrictions in Settings** — per-tenant **encrypted key storage** (new security surface) + multi-provider wiring to consume tenant keys + a Settings UI. "Other agent restrictions" beyond on/off = the **Phase-28 condition vocabulary**. | OPEN. **Multi-provider-wiring dependency now satisfied by Phase 24**; still needs **CF-12.4** (credential encryption-at-rest) + the Settings UI. (The encryption item is **CF-12.4**, not CF-12.1 — live bank wins over the 23h handoff prose.) |
| **CF-23.2** | **Dollar-meter aggregation optimization** — `tenantCommittedAllTime` / `withinSpendCeilings` resolve `getEffectiveNte` once per committed job (Big.js reduce; no SQL aggregate). Per-tenant lifetime axis is O(N). | OPEN. Fine at current (≈zero) autonomy volume; optimize when real volume lands. |

**Phase-23 soft notes (open, low-priority):**
- **`autonomyEnabled`-naming clarity.** `ResolvedPolicy.autonomyEnabled` reflects only the **policy +
  kill-switch** halves; the full "may this action fire" answer ANDs `withinTokenCeilings().ok &&
  withinSpendCeilings().ok` at the enforcement site. The field name alone does not mean "fully
  permitted" — a rename or a derived `fullyPermitted()` helper could clarify.
- **Rolling-24h vs calendar-day window.** "Per-day" everywhere is a rolling trailing 24h
  (`NOW() - INTERVAL 1 DAY`, DB-computed). A tenant-local calendar-day boundary would be a net-new
  convention (needs a tenant tz; only `clients.timezone` exists today, for SLA hours).

### Phase-22 banked items (open)
| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-22.1** | **Rich service-area coverage model** — geo matching is **equality-only** (national/state/city/postal); `radius` and `county` rows are **stored but inert**. | Client-location geocoding + a distance predicate (radius); and/or polygon coverage, map-drawing, prior-service-history. | Known-hard model; Phase 22 built the floor against equality geo. **Relates to the 17a geo gap** (no `client_locations` lat/long). |
| **CF-22.2** | **Client-level default preferred vendor** — `location_preferred_vendors` is per-location-per-trade; a client-level default isn't supported. | A nullable-location preferred row + precedence-resolution (location overrides client default). | Per-location-per-trade is the locked D1 grain; client-default precedence is beyond Tier-1/2 scope. |
| **CF-22.3** | **Client-wide-ban authoring UI + preferred/blocklist management polish** — the matcher honors client-wide block rows; the operator surface only authors location-scoped blocks. | A client-detail surface to author/clear a client-wide ban (NULL-location row) + a fuller management screen. | Location-scoped authoring covers the primary case; client-wide authoring + polish deferred. |

**Phase-22 soft notes (open):**
- **The auto-picker trigger — now tracked as CF-24.2.** Phase 23 delivered the governance + auto-advance
  + guardrails; Phase 24 delivered the observability evidence; the **live trigger** remains unwired and
  is re-banked as **CF-24.2** above (§2.3, observability-gated). Still by design, not an unfinished feature.
- **Compliance floor is fail-open-with-flag — TEMPORARY (Phase-5 D-5.2).** Absent compliance row = `no_data`
  = eligible-but-recorded; tightens to a hard gate with **no schema change** when compliance data lands.
- **`location_blocked_vendors` accumulates archived history** — re-block inserts a fresh active row; a
  row-pruning policy is not built (not blocking).

### Phase-21 banked items (open)
| Id | Item |
|---|---|
| ~~CF-21.1~~ | **DISCHARGED @ `76c5252`** (roadmap §6/§9 B-16.3 correction landed; B-16.3 stays OPEN). Discharged in the Phase-22 cycle; recorded here as history. |
| CF-21.2 | Vendor account-claim / onboarding from linkless usage — the **linkless→registered bridge**. Relates **FB-10a.1**. |
| CF-21.3 *(soft)* | Mint-new-per-send token accumulation — a pruning/retention policy if row growth matters. |
| CF-21.4 *(soft)* | SMS link delivery — a second `SendProvider` (e.g. Twilio) + a phone recipient. Relates **CF-19.2**. |

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
| B-15.3 | Mass-op operator UI + snow operator screens. *(§9 "Phases 18/22/28" bucket — unfulfilled by Phases 22/23/24.)* |
| B-15.4 | Snow dashboard read surface. |
| CF-15.1 | `spawned_count`/`skipped_count` columns on `snow_events`. |

### Inherited bank (from the Phase-15 roll-forward)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — gated on accumulated review-confirm data + §2.5 relaxation. **(Distinct from dispatch autonomy — email auto-create is unbuilt; stays OPEN.)** |
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
| B-14.1 | PM Programs UI placement (dedicated section + client-profile read list). *(§9 "Phases 18/22/28" bucket — unfulfilled by Phases 22/23/24.)* |
| B-14.2 | Live cron / scheduler trigger (timer calling `runDueSchedules`). |
| B-14.3 | Per-location scope/trade override on a PM membership. *(§9 bucket — unfulfilled by Phases 22/23/24.)* |
| B-14.4 | Mass-dispatch + generic mass-update UI (operator-portal). *(§9 bucket — unfulfilled by Phases 22/23/24.)* |
| B-14.5 | `pm_assets` lightweight cap (explicit scope cap, not EAM). |
| CF-14.1 | PM checklist result instantiation (`pm_visit_results` per visit from the template). |
| CF-14.2 | Operator authz gate on `approvePmVisits` (action wrapper). |
| CF-14.3 | PM program/schedule CRUD UI. *(§9 "Phases 18/22/28" bucket — unfulfilled by Phases 22/23/24.)* |

## Standing watchpoints (carried forward)

- **pnpm not npm** (an `npm install` crashes npm's arborist against the pnpm `node_modules`).
- **Name the DB explicitly** (WP-12.1); **pre-name FKs >64 chars** (WP-12.2 — `tas_tenant_fk` in 0046).
- **MariaDB-JSON parse-at-read** — `json()` columns come back as strings; parse at the read boundary.
  Read verdicts from a file + true exit.
- `inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2 —
  a stale buildinfo masked the CF-24.1 latent state until B1's edits invalidated the cache).
- `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only;
  better-auth NULL-tenant audit rows.
- **Snow naming care** — `snow_events` (storm batch header) ≠ `job_events`; `snow_dispatches` is NOT a
  vendor-assignment table.
- **drizzle forward-FK ordering** — a referenced table must be declared before the table whose FK
  callback references it.
- **Vendor updates live in `job_notes` (`origin='vendor'`)**, not `vendor_update_logs`.
- **Migration cadence** — sandbox apply → `-E` contract-verify → prod-confirm gate → prod apply; a
  pre-set shell `DATABASE_URL` survives drizzle-kit's env load (dotenv non-override) — confirm the
  resolved DB name before any prod DDL. (Phase 24 added no migration; 0047 untouched.)
- **Storage seam is capture-by-default** (`R2_*` for real R2; `STORAGE_FORCE_FAIL` test-only).
- **Send seam is capture-by-default** (`RESEND_*` for real email; `SEND_CAPTURE=1` forces capture);
  **`APP_URL`** is the magic-link base — wrong/unset = dead links.
- **Never store/log the raw magic-link token** — only its `sha256`.
- **Harness teardown under `FK_CHECKS=0` does NOT cascade** — delete children explicitly by tracked id;
  **never delete by a `created_at`/timestamp window** (JS-Date-vs-DB-timezone skew). Re-applied in the
  Phase-24 harness (children-first by tracked id, fresh `phase24-harness-tenant`).
- **Two-NULLs rule (Phase-23)** — a NULL *cap* is **permissive** (skip/within); a NULL *measurement*
  is **restrictive** (block). Phase-24 cost has the analogue: a NULL/unknown **model** is **excluded**
  from cost (unmeasurable, NOT $0) — never a false zero.
- **`agent_decisions` requires a synthetic `agent_runs` row (Phase-23)** — `agent_run_id` NOT NULL, no
  direct `agent_id`; a rule-based agent that wants a decision row must `openRun` first.
- **Phase-22 ledger ↔ Phase-23 vocabulary lineage** — `check-phase-22.ts` was edited (`drafted` →
  `drafted_pending`) when the governed `AutoDispatchResult` removed bare `"drafted"`. Recorded so it
  is not mistaken for a regression.
- **Standalone TS scripts need `export {};` (Phase-24 / CF-24.1)** — a bare script (no top-level
  import/export) puts its top-level `main()` in the **global** TS scope, where it collides with another
  bare script's `main()` (`TS2393` "Duplicate function implementation"). Every `scripts/*.ts` with a
  `main()` MUST start with `export {};` (module isolation). This is exactly the bug CF-24.1 was.
- **Prod-ops scripts follow the `db/seeds` precedent, NOT the check-script sandbox guard (Phase-24)** —
  a retention/migration/seed-style script that must run against **prod** deliberately does NOT copy the
  check-`*.ts` rewrite-to-`_sandbox`-or-refuse guard (which would make it structurally unable to do its
  job). Its safety is **dry-run-default + loud target-DB print + explicit `--apply`**. Only **check
  harnesses** force `_sandbox`.
- **Multi-provider keys are PLATFORM env keys (Phase-24)** — `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`;
  failover provider availability = env-key presence (unset = dormant, never an error). **No tenant-key
  storage** until CF-12.4 (CF-23.1 boundary). `recordedModel` must reflect the provider that actually
  ran (truthful cost/volume under failover).
- **Roadmap §6/§9 over-attribute retirements** — CF-19.4 (CF-12), CF-20.3 (CF-13.4), CF-21.1 (B-16.3 —
  discharged) are the running list of §6/§9 retirement claims unsupported by the live bank. The §9
  "Phases 18/22/28" operator-UI bucket is a **conditional** ("as the surfaces land") variant —
  unfulfilled by Phases 22/23/24, no correction needed, but watch it. **Verify any "retires/depends-on
  X" claim against the live bank text** (live bank wins over roadmap §6/§9 and over handoff prose — e.g.
  the encryption item is **CF-12.4**, not CF-12.1).
