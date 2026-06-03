# Phase 26 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-25-feedback/closeout-carryforwards.md`, with the new Phase-26 items added and the
per-agent B-16.5 retirement applied.

> **Source-of-truth rule (carried forward):** this LIVE bank wins over the roadmap §6/§9 summary and
> over handoff prose. Verify any "retires / depends-on X" claim against this text — e.g. the
> credential-encryption item is **CF-12.4**, not CF-12.1; and B-16.5 retires **per agent**, beginning
> with the invoice creator (Phase 26), not all at once.

## Retired / discharged since the last bank (Phase 26)

**B-16.5 — "LLM-assisted draft phrasing (provider seam + `ai_prompt_templates`)" — PARTIALLY RETIRED.**
Phase 26 ships the first new agent (`invoice_creator_v1`), delivering B-16.5's **per-agent** share for
the invoice creator. The roadmap defines B-16.5 as retiring **per agent** across the v2.9.0 new-agents
arc; that retirement **begins** with Phase 26 (it was fully OPEN through Phase 25 — no earlier phase is
credited with retiring it). **Residual = the proposal generator + the NTE negotiator** (not yet built).
**B-16.5 STAYS OPEN** with that reduced residual.

- *Honest nuance:* the seam B-16.5 names (provider routing + `ai_prompt_templates`) was actually built
  in Phases 6–7 and is **reused** by the invoice agent, not newly built. "Retires per agent" means
  each new agent is a delivered LLM-phrasing agent on that seam — consistent framing, recorded so it is
  not mistaken for a from-scratch build.

No other inherited item is retired by Phase 26 — **no evidence** supports one. (Checked: client-portal
invoice-line-detail `CF-11.x`, invoice-aging `CF-16.2`, §2.5 relaxation `CF-13.1` — none touched.
Phase 26 *adds a correction source* feeding Phase 25 but **resolves none** of CF-25.1–25.4.)

## New Phase-26 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-26.1** | **No agent-assisted breakdown of lazy/lumped vendor invoices** — a single non-itemized vendor charge is kept WHOLE at the vendor total with `lumpFlag=true` (money-safe; never split into invented sub-amounts). A smarter agent that *breaks out* a lumped charge into itemized client lines is not built. | Authored vendor rate-book data to attribute costs, then a breakdown step in the agent. `vendor_rates` and `vendor_performance_scores` **exist** but carry **no authored rate data** (no rate-book ingestion/authoring surface; B-16.4 confirms `vendor_performance_scores` is unpopulated). | No rate data to break a lump down safely; keep-whole-and-flag is the correct money-safe floor until that data lands. |
| **CF-26.2** | **Invoice publish partial-failure window** — publish is a NON-atomic sequence (`createClientInvoice` + N×`addClientInvoiceLineItem` before the finalize txn stamps `published_client_invoice_id`). A mid-sequence crash or a concurrent publish can orphan a `client_invoices` DRAFT (never issued, operator-deletable, recoverable). | A no-cost atomicity guard (a `materializing` status value, or a provisional marker before `createClientInvoice`) — each needs a follow-up migration or breaks the `published_client_invoice_id` NULL-means-unpublished semantics. | §2.6 ACCEPTED trade-off: the idempotency guard (`published_client_invoice_id` non-null → `InvoiceAlreadyMaterialized`, pre-flight + under the finalize lock) prevents double-materialize; we did NOT refactor the billing writers for cross-writer atomicity. Close only if a no-cost guard appears. |

## Factual updates (no state change)

- **Migration `0047` is now CONSUMED** (`invoice_drafts` + `invoice_reviews`, applied to prod, 119→121).
  It was previously "left free for the deciding phase" — Phase 26 is that phase.
- **CF-25.1's "why deferred" is now stale** — it cited "`0047` left free for the deciding phase." 0047
  is consumed; **CF-25.1 itself (few-shot provenance on `agent_runs`) is untouched and stays OPEN.**

---

## Inherited (roll forward, UNCHANGED)

### Phase-25 banked items (open)
| Id | Item | Status |
|---|---|---|
| **CF-25.1** | Few-shot provenance not recorded on `agent_runs` — `prompt_version` records which template ran, but not which correction examples were injected. | OPEN. (Its "0047 left free" rationale is now stale — 0047 consumed; the item is unaffected.) |
| **CF-25.2** | Human-curation "approved-for-few-shot" flag not built — every harvested gold/positive pair is injectable; no operator bless/exclude step. | OPEN. No curation problem to solve at single-digit live pairs. |
| **CF-25.3** | Negatives (rejects) harvested but not injected — `selectFewShotPairs` excludes NEGATIVE. | OPEN. Banked for a contrastive-eval rung. |
| **CF-25.4** | Held-out measurement is seeded-synthetic-only; feedback-poison unaddressed — no trust filter on injectable corrections. | OPEN. Live data too thin to measure a real lift; revisit as the operator pool grows. |

### Phase-24 banked items (open)
| Id | Item | Status |
|---|---|---|
| **CF-24.2** | **Live autonomy trigger** — `autoDispatchDraftForJob` (and now `runInvoiceCreator`) is invoked by nothing in app code; no job-creation hook / cron / queue. | OPEN. **§2.3 — permission ≠ readiness.** The governed agents + observability evidence exist; flipping the switch is a deliberate, evidence-informed future decision. **Rolls forward OPEN, unchanged.** (Phase 26 adds a second high-volume agent to the evidence base but wires no trigger.) |

**Phase-24 soft notes (open):** OpenAI is built but dormant / not live-proven (failover verified by
logic, not live traffic; `openai/gpt-5.4` price third-party-sourced — confirm at key-add).

### §9 operator-portal-UI bucket — unfulfilled (rolls forward OPEN)
Roadmap §9 lists `B-14.1 / B-14.3 / B-14.4 / B-15.3 / CF-14.3` under "Retired by v2 phases … (Phases
18/22/28 **as the surfaces land**)." Phases 22–26 built none of those PM/snow/mass-op operator UIs —
they remain **unfulfilled** and roll forward OPEN. §9's wording is **conditional**, so this is not a
false flat retirement; the standing §6/§9 over-attribution watchpoint carries forward.

### Phase-23 banked items (open)
| Id | Item | Status |
|---|---|---|
| **CF-23.1** | Tenant-supplied LLM API keys + self-service AI restrictions in Settings — per-tenant **encrypted key storage** + multi-provider wiring + a Settings UI. "Other agent restrictions" = the Phase-28 condition vocabulary. | OPEN. Multi-provider-wiring dependency satisfied by Phase 24; **still needs CF-12.4** (credential encryption-at-rest) + the Settings UI. (The encryption item is **CF-12.4**, not CF-12.1 — live bank wins.) |
| **CF-23.2** | Dollar-meter aggregation optimization — per-tenant lifetime axis is O(N) (Big.js reduce, no SQL aggregate). | OPEN. Fine at near-zero autonomy volume; optimize when real volume lands. |

**Phase-23 soft notes (open):** `autonomyEnabled`-naming clarity (policy+kill-switch only; full answer
ANDs the spend/token ceilings); rolling-24h vs calendar-day window.

### Phase-22 banked items (open)
| Id | Item |
|---|---|
| **CF-22.1** | Rich service-area coverage model — geo matching is equality-only; `radius`/`county` stored but inert. (Relates the 17a geo gap.) |
| **CF-22.2** | Client-level default preferred vendor — `location_preferred_vendors` is per-location-per-trade only. |
| **CF-22.3** | Client-wide-ban authoring UI + preferred/blocklist management polish. |

**Phase-22 soft notes (open):** auto-picker trigger now tracked as CF-24.2; compliance floor is
fail-open-with-flag (TEMPORARY, Phase-5 D-5.2); `location_blocked_vendors` archived-history accumulation.

### Phase-21 banked items (open)
| Id | Item |
|---|---|
| ~~CF-21.1~~ | **DISCHARGED @`76c5252`** (roadmap §6/§9 B-16.3 correction landed; B-16.3 stays OPEN). History. |
| CF-21.2 | Vendor account-claim / onboarding from linkless usage — the linkless→registered bridge. Relates **FB-10a.1**. |
| CF-21.3 *(soft)* | Mint-new-per-send token accumulation — pruning/retention policy if row growth matters. |
| CF-21.4 *(soft)* | SMS link delivery — a second `SendProvider` (Twilio) + a phone recipient. Relates **CF-19.2**. |

**Phase-21 soft notes (open):** `APP_URL` deploy-time var (wrong/unset = dead links); presigned-URL
issuance window outlives revocation (~5 min); 7-day token expiry fixed.

### Phase-20 banked items (open)
| Id | Item |
|---|---|
| CF-20.1 | Operator-side attachment reader + photo viewing. |
| CF-20.2 | Orphan-object sweep (storage keys ↔ `job_attachments.storage_key`). |
| CF-20.3 | Roadmap §6/§9 CF-13.4 doc-correction (conflated email-attachments backend with FB-10a.4 vendor photos). |
| — (soft) | `vendor_documents` could reuse the storage adapter; FB-10a.4 legacy-placeholder backfill not performed. |

### Phase-19 banked items (open)
| Id | Item |
|---|---|
| CF-19.1 | Business-hours-aware SLA/escalation clock. |
| CF-19.2 | Twilio SMS adapter (a second `SendProvider`). |
| CF-19.3 | No-same-day-on-site exception (blocked on CF-19.1). |
| CF-19.4 | Roadmap §9 CF-12 doc-correction (non-existent "CF-12.x outbound send" + scrambled CF-12.1/12.4 labels). |
| — (soft) | `change_orders.submitted_at` proxy; Resend `Idempotency-Key` vs `failed→sent` retry. |

### Phase-18 banked items (open)
| Id | Item |
|---|---|
| CF-18.1 | Queue original-source note (the cross-job draft queue omits the originating note body). |
| CF-18.2 | `(tenant_id, origin)` index on `job_notes`. |

### Phase-16 banked items (open)
| Id | Item |
|---|---|
| B-16.3 | Chat UI + vendor-direction publish target. Stays OPEN (magic-link send only partially unblocks). |
| B-16.4 | Vendor performance reader + populate `vendor_performance_scores`. *(Tier-3 AI dispatch, Phase 27, is data-blocked on this. Also CF-26.1's rate-data blocker relates here.)* |
| **B-16.5** | **LLM-assisted draft phrasing (provider seam + `ai_prompt_templates`). PARTIALLY RETIRED by Phase 26** (invoice creator's per-agent share). **Stays OPEN; residual = proposal generator + NTE negotiator.** |
| CF-16.1 | `source_type` intent-tag enum value on `update_rewrite_drafts`. |
| CF-16.2 | Invoice-aging anomaly rule (extend `flagInvoiceAnomalies`). |
| CF-16.3 | `source_id` polymorphic-meaning doc. |
| RAG-if-outgrows | RAG / embeddings retrieval if the curated knowledge layer outgrows model context. |

### Phase-15 banked items (open)
| Id | Item |
|---|---|
| B-15.1 | Snow service-log capture RUNTIME. |
| B-15.2 | Live weather feed + auto-event-trigger. |
| B-15.3 | Mass-op operator UI + snow operator screens. *(§9 bucket — unfulfilled by Phases 22–26.)* |
| B-15.4 | Snow dashboard read surface. |
| CF-15.1 | `spawned_count`/`skipped_count` columns on `snow_events`. |

### Inherited bank (from the Phase-15 roll-forward)
| Id | Item |
|---|---|
| CF-13.1 | Autonomous high-confidence auto-create (email) — gated on review-confirm data + §2.5 relaxation. (Distinct from dispatch/invoice autonomy; stays OPEN.) |
| CF-13.2 | Live email receiver (IMAP/webhook/mailbox polling). |
| CF-13.3 | Real deterministic + AI email extractor logic. |
| CF-13.4 | Email attachment physical-storage backend. Partially unblocked by the Phase-20 R2 seam; still OPEN. |
| CF-13.5 | Email→client resolution column on `email_ingestion_accounts`. |
| CF-13.6 | Email approve→link orphan window. |
| CF-13.7 | Operator email review-queue UI (+ AI-assist invocation surface). |
| CF-12.1 | Full-workflow auto-push (job change → mapped external platform). |
| CF-12.2 | Live external adapter (real fetch/push HTTP). |
| CF-12.3 | Operator mapping UIs (`external_*_mappings` management). |
| **CF-12.4** | **Credential encryption-at-rest. (CF-23.1 tenant-API-key storage depends on this.)** |
| CF-12.5 | External-ingest IF-4 orphan window. |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–15). |
| FB-10a.1 | Vendor/client invite & onboarding flow. *(CF-21.2 relates.)* |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`). |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture. |

### Inherited Phase-14 banked items (still open)
| Id | Item |
|---|---|
| B-14.1 | PM Programs UI placement. *(§9 bucket — unfulfilled by Phases 22–26.)* |
| B-14.2 | Live cron / scheduler trigger (timer calling `runDueSchedules`). |
| B-14.3 | Per-location scope/trade override on a PM membership. *(§9 bucket.)* |
| B-14.4 | Mass-dispatch + generic mass-update UI. *(§9 bucket.)* |
| B-14.5 | `pm_assets` lightweight cap. |
| CF-14.1 | PM checklist result instantiation. |
| CF-14.2 | Operator authz gate on `approvePmVisits`. |
| CF-14.3 | PM program/schedule CRUD UI. *(§9 bucket.)* |

## Standing watchpoints (carried forward)

- **pnpm not npm**; **name the DB explicitly** (WP-12.1); **pre-name FKs >64 chars** (WP-12.2).
- **MariaDB-JSON parse-at-read** — `json()` columns come back as strings; parse at the read boundary.
  To read a `json()` column as its RAW stored string, select via `CAST(col AS CHAR)` (bypasses
  drizzle's decoder) — used by the scope **and now the invoice** correction-pairs readers.
- `inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2).
- `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only; better-auth
  NULL-tenant audit rows.
- **Snow naming care** — `snow_events` ≠ `job_events`; `snow_dispatches` is NOT a vendor-assignment table.
- **drizzle forward-FK ordering** — a referenced table must be declared before the table whose FK
  callback references it (re-applied authoring `agents-invoice.ts`).
- **Vendor updates live in `job_notes` (`origin='vendor'`)**, not `vendor_update_logs`.
- **Migration cadence** — sandbox apply → `-E` contract-verify → prod-confirm gate → prod apply; a
  pre-set shell `DATABASE_URL` survives drizzle-kit's env load — confirm the resolved DB name before
  any prod DDL. (**Phase 26 added migration 0047, applied to prod via this cadence; 0047 consumed.**)
- **Storage seam / Send seam are capture-by-default**; `APP_URL` is the magic-link base; never
  store/log the raw magic-link token (only its `sha256`).
- **Harness teardown under `FK_CHECKS=0` does NOT cascade** — delete children explicitly by tracked id;
  never by a `created_at`/timestamp window. **Phase-26 corollary: an agent invoked in-harness writes
  `agent_tool_calls` + `agent_decisions`; under `FK_CHECKS=0` ON DELETE CASCADE does NOT fire, so those
  child rows must be deleted explicitly by `agentRunId` (established by `check-phase-26.ts`). Phase-25's
  harness never hit this because it never invoked an agent.**
- **Two-NULLs rule (Phase-23)** — NULL cap permissive, NULL measurement restrictive; Phase-24 cost
  analogue (NULL/unknown model excluded, not $0).
- **`agent_decisions` requires a synthetic `agent_runs` row** — correction drafts/reviews hang off a
  real run; the harvest reader joins `agent_runs → drafts → reviews`; harnesses seed the full chain.
- **Standalone TS scripts need `export {};`** (module isolation, TS2393) — re-applied in
  `check-phase-26.ts`.
- **Prod-ops scripts vs check-script sandbox guard** — only check harnesses force `_sandbox`.
- **Multi-provider keys are PLATFORM env keys** — failover availability = env-key presence; no
  tenant-key storage until CF-12.4 (CF-23.1 boundary); `recordedModel` truthful under failover;
  `PROVIDER_REGISTRY` is mutable DATA (a harness may override `.buildModel`, restoring it in `finally`).
- **`createdAt` is THE canonical latest-review-per-draft ordering** — the feedback harvest reader and
  the Phase-24 observability reader BOTH dedupe by `created_at` via the ONE shared
  `latestReviewPerDraft` primitive; they MUST NOT diverge. **The invoice adapters (`invoiceCorrectionPairs`,
  `invoiceApproveAsIs`) reuse this primitive; both other harnesses stayed green, proving no drift.**
- **Money-safety as a TYPE constraint (Phase-26)** — for an agent that touches money, make the LLM
  output schema **number-free** and join the dollars in from the source-of-truth (the vendor invoice),
  rather than instructing the model not to invent numbers. Re-use the canonical money writers
  (`billing/totals.ts`); re-resolve markup fresh at the materialization boundary.
- **Roadmap §6/§9 over-attribute retirements** — CF-19.4 (CF-12), CF-20.3 (CF-13.4), CF-21.1 (B-16.3 —
  discharged) are the running list of §6/§9 claims unsupported by the live bank. The §9 "Phases
  18/22/28" operator-UI bucket is a **conditional** variant — unfulfilled by Phases 22–26, watch it.
  **Verify any "retires/depends-on X" claim against this live bank** (it wins over §6/§9 and handoff
  prose — the encryption item is **CF-12.4** not CF-12.1; B-16.5 retires **per agent**, beginning Phase
  26, and is only PARTIALLY retired here).
