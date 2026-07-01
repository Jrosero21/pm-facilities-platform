# Phase 27 — Carry-Forwards

The canonical post-MVP backlog, rolled forward from
`docs/phase-26-invoice-agent/closeout-carryforwards.md`, with the new Phase-27 items added, the
per-agent B-16.5 retirement advanced (proposal-generator share), and the B-16.4 phase-slot note
corrected. Every inherited entry below is spliced **verbatim** from the Phase-26 bank.

> **Source-of-truth rule (carried forward):** this LIVE bank wins over the roadmap §6/§9 summary and
> over handoff prose. Verify any "retires / depends-on X" claim against this text — e.g. the
> credential-encryption item is **CF-12.4**, not CF-12.1; and B-16.5 retires **per agent**, beginning
> with the invoice creator (Phase 26) and now the proposal generator (Phase 27), not all at once.

## Retired / discharged since the last bank (Phase 27)

**B-16.5 — "LLM-assisted draft phrasing (provider seam + `ai_prompt_templates`)" — STILL PARTIALLY
RETIRED (proposal-generator share now delivered).**
Prior (Phase-26) wording, verbatim: *"PARTIALLY RETIRED. Phase 26 ships the first new agent
(`invoice_creator_v1`), delivering B-16.5's per-agent share for the invoice creator. … Residual = the
proposal generator + the NTE negotiator (not yet built). B-16.5 STAYS OPEN with that reduced residual."*
**Phase-27 update:** Phase 27 ships the second new agent (`proposal_generator_v1`), delivering B-16.5's
**proposal-generator** per-agent share. **Residual = the NTE negotiator ONLY** (not yet built).
**B-16.5 STAYS OPEN** with that further-reduced residual; Phase 27 does **not** fully discharge it.

- *Honest nuance (carried forward):* the seam B-16.5 names (provider routing + `ai_prompt_templates`)
  was actually built in Phases 6–7 and is **reused** by each new agent, not newly built. "Retires per
  agent" means each new agent is a delivered LLM-phrasing agent on that seam — consistent framing,
  recorded so it is not mistaken for a from-scratch build.

**B-16.4 — phase-slot note CORRECTED.**
Prior (Phase-26) wording, verbatim: *"B-16.4 | Vendor performance reader + populate
`vendor_performance_scores`. (Tier-3 AI dispatch, Phase 27, is data-blocked on this. Also CF-26.1's
rate-data blocker relates here.)"*
**Correction:** Per the roadmap §6 new-agents ordering (invoice → **proposal** → NTE negotiator), the
**proposal generator took the v2.10.0 / Phase-27 slot**; **AI-assisted dispatch (Tier 3) shifts to a
later phase**. The data dependency is **unchanged** — dispatch remains data-blocked on this (populate
`vendor_performance_scores`, which needs Phase-20 vendor-portal performance history). CF-26.1's
rate-data blocker still relates here. (The corrected text is also applied to the B-16.4 row in the
inherited Phase-16 table below.)

No other inherited item is retired by Phase 27 — **no evidence** supports one. (Phase 27 *adds a
correction source* feeding Phase 25 — `proposalCorrectionPairs` — but **resolves none** of
CF-25.1–25.4, and resolves none of CF-26.1/26.2.)

**CF-20.3 — Roadmap §6/§9 CF-13.4 doc-correction — DISCHARGED (by the CF-20.1 sub-feature, post-Phase-27).**
The §6/§9 text already reads correctly: Phase 20 retires **FB-10a.4** (vendor photos), **NOT CF-13.4**
(the email-attachments backend, which stays open). No roadmap edit was required — the correction CF-20.3
called for is already present. Relocated here from the Phase-20 "(open)" table: it is fully closed, not
open. (The standing §6/§9 over-attribution watchpoint below still lists CF-20.3 — that guard is
correctly persistent and is left untouched.)

**CF-20.1 — Operator-side attachment reader + photo viewing — RETIRED (live-verified 2026-06-17).**
Shipped as the CF-20.1 sub-feature (`docs/cf-20-1-operator-photo-viewing/`, tagged `v2.22.0`): tenant+job-scoped
reader (`listJobPhotos`/`getJobPhotoUrl`, no-existence-leak) + thumbnail panel on the job-detail page;
`db:check:job-photos` 15/15 green. **Live-verify now PASSED end-to-end** — an operator rendered a real
uploaded photo against configured R2 (eyes-on the rendered thumbnail, plus data confirmation: real
`storage_key`, R2 object present in `pm-facilities-attachments` with matching 92,452-byte size, and
`getJobPhotoUrl` returns a live `https://…r2.cloudflarestorage.com` presigned URL — **not** `capture://`).
The prior "build-complete / retirement-pending R2" caveat is discharged; relocated here from the Phase-20
"(open)" table. **CF-20.1b** (cross-job feed) and **CF-20.2** (orphan-object sweep) remain open, untouched.

**B-16.4 — Vendor performance reader + populate `vendor_performance_scores` — RETIRED (built + validated 2026-06-18).**
Shipped as the B-16.4 sub-feature (`docs/b-16-4-vendor-performance-scorer/`) — the data keystone the
roadmap's Phase-27 (AI-Assisted Dispatch, Tier 3) is blocked on. Four-commit vertical slice: `ddd4592`
synthetic fixture (55 vendors, 6 archetypes, sandbox-guarded) · `244e2f1` migration 0054
(`total_dispatches` + `completion_rate`, additive) · `30ca4bf` the scorer (`computeVendorPerformanceScores`
two-pass completion/on-time + K=5 shrinkage; `getVendorPerformanceScores` reader) · `7792cca` chatbot read
surface. **`db:check:vendor-performance` 14/14 green**, cohort ranking correct: reliable_fast **77.7** >
reliable_slow **68.8** > newcomer_thin **58.0** > flaky_fast **49.5** > flaky_unreliable **28.7** (the
completion-dominant 70/30 weighting ranks "done-but-late" above "fast-but-flaky," as intended). Relocated
here from the Phase-16 "(open)" table. **Phase-27 / AI-Assisted Dispatch is now data-UNBLOCKED** (the
`vendor_performance_scores` data dependency is delivered) — though the dispatch agent itself stays unbuilt — **UPDATE (v2.24.0):** the AI-assisted dispatch agent IS now built and shipped (deterministic scorer + re-rank + LLM tiebreaker `dispatch_tiebreaker_v1`; tag v2.24.0). See the AI-assisted dispatch banked-items section below.
**Remaining gate: migration 0054 PROD-APPLY** (the two direct ALTERs, sandbox→prod; NOT CF-iii.1, which is
unrelated R2 storage). The earlier "B-16.4 phase-slot note CORRECTED" entry above is superseded by this
retirement. *(§9 lists B-16.4 as "retired by Phase 27" — loose wording; it actually shipped standalone
post-`v2.22.0`, not inside `phase-27-proposal-agent`. Recorded, no doc-correction CF opened.)*

**Dispatch status label "Declined" → "Vendor Declined" — SHIPPED (2026, sandbox + prod applied).**
The dispatch_assignment_statuses display label for code `DECLINED` was renamed
from "Declined" to "Vendor Declined" for who-declined clarity. CODE `DECLINED`
unchanged, so all platform logic and check-harnesses (which key on the code) are
unaffected. Applied as a one-row UPDATE to both sandbox and prod (`jonnyrosero_pm`),
each verified exactly one row changed. The b16-4 fixtures were re-keyed from
status-NAME to status-CODE lookups (rename-proof going forward); a gated,
idempotent prod label script (`scripts/rename-declined-label-prod.ts`) is kept as
the record. Commit f025c85. This was the "parked idea" from B-16.4 — now closed,
distinct from PD-4 (the future per-tenant reference-data admin UI).

**Dispatch-stuck detection (CF-19.1a, SENT-only) + dev-safety — SHIPPED (2026, sandbox-verified).**
The wall-clock dispatch-SLA detection rung shipped: a priority×status "stuck > X hours" threshold matrix + `isDispatchStuck` classifier (`dispatch-sla-rules.ts`, 9/9 offline), wired into `listVendorNotAccepted` (priority leftJoin) and surfaced as a red "Stuck" badge with a per-tier threshold note, stuck rows bumped above merely-aged ones (two-band ordering). Browser-verified end-to-end across all 6 priority tiers (EMERGENCY 2h / URGENT 4h / HIGH 8h / ROUTINE 24h / SCHEDULED 48h / null→24h DEFAULT) on real rendered sandbox data. Commit 2ba3eaf. **Reaction half RUNG 1 — the OPERATOR-GATED suggest-and-confirm re-dispatch — SHIPPED (2026-06-21, commits `7dfab4b`→`23fa832`; see the CF-19.1a-react annotation at EOF):** a stuck dispatch surfaces "Suggest replacement" (operator-click prepares a re-rank DRAFT) → "Approve re-dispatch" (ghosts the unresponsive vendor + sends the replacement). **STILL OPEN: the AUTONOMOUS reaction** (auto-fire without an operator click) is gated on CF-24.2, and the **all-statuses expansion** (CF-19.1a-statuses) — both remain open. Alongside this, a dev-safety fix: `pnpm dev` now defaults to SANDBOX via `.env.development.local` precedence (Next 16 @next/env load order), with an explicit `pnpm dev:prod` escape hatch (commit 822809d) — the dev server previously read the raw prod `DATABASE_URL`, so a dev browser click could write to prod; it now hits sandbox by default. Two sandbox verification seeds committed (`seed-sandbox-dev-login.ts`, `seed-sandbox-sent-spread.ts`, commit ccfa576).

**Policy-conditions vocabulary (Phase 28) — SHIPPED (2026-06-22, sandbox-verified, commits `b5f6606`→`2f12c5f`).**
The autonomy gate gained a per-policy conditions vocabulary: a tenant can express amount thresholds (effective NTE ≤ $X), trade filters (allow/block by code), priority filters (e.g. never EMERGENCY), and client include/exclude — all **NARROWING-ONLY** (they can only make autonomy more restrictive, never widen past the kill-switch, the spend/token ceilings, or the fail-safe gate). **C1** (`b5f6606`) the pure Zod-validated evaluator (13/13 offline): absent conditions = no narrowing (backward-compat no-op for every existing policy), invalid = fail-safe gated, unknown NTE = gated. **C2** (`00d84f4`) wired it as one more `&&` in auto-dispatch's live `permitted` chain, build-only-when-set, recording `policy_condition:<reason>` in the audit (probe 6/6 on the real gate). **C3** (`2f12c5f`) a validated setter on the blessed `activateAgentPolicy` path, demonstrating the tenant-"world view" vs per-client **whole-cloth OVERRIDE** (the resolver's most-specific-wins picks the client policy entire, not merged — the replace-not-layer model). **STILL OPEN:** the authoring UI (no in-app policy editor — the `set-agent-conditions-policy.ts` script is the stopgap; this is the same Settings-UI gap **CF-23.1** names, not a separate surface — see **CF-28.1** at EOF), and — critically — conditions only **ACT** once **CF-24.2** wires the autonomous trigger (today they govern a path nothing auto-fires; §2.3 permission ≠ readiness). Confidence floors excluded (no Phase-24 calibration).

## New Phase-27 banked items (open)

| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-27.1** | **No vendor-initiated NTE-increase record** — when a vendor needs the not-to-exceed ceiling raised, there is no agent-drafted, vendor-justified increase record; the operator raises the ceiling via a **change order** (which `getEffectiveNte` already sums). | A net-new request/justification record (the NTE negotiator's substrate — `agent_negotiation_threads` exists but is unbuilt) + a review/approve gate. | This is the **NTE negotiator's** job (the next per-agent B-16.5 share / highest-stakes agent); out of the proposal generator's scope. The change-order path is the correct floor today. |
| **CF-27.2** | **No proposal → invoice link** — a published proposal is not linked to the client invoice eventually billed against it; only a `job_billing_events` correlation (same `job_id`) exists, no FK basis. | A provenance column/table tying a `proposals` row (esp. an `internal_billed` one) to its `client_invoices` materialization, + the writer to populate it. | No invoicing-from-proposal path is built this phase; adding an FK with nothing to point at is premature. Adjacent to CF-27.4. |
| **CF-27.3** | **Proposal publish partial-failure window** — publish is a NON-atomic sequence (`createProposal` + N×`addProposalLineItem` before the finalize txn stamps `published_proposal_id`). A mid-sequence crash or a concurrent publish can orphan a `proposals` DRAFT (never finalized, operator-deletable, recoverable). | A no-cost atomicity guard (a `materializing` status, or a provisional marker before `createProposal`) — each needs a follow-up migration or breaks the `published_proposal_id` NULL-means-unpublished semantics. | §2.6 ACCEPTED trade-off, the exact analogue of **CF-26.2**: the idempotency guard (`published_proposal_id` non-null → `ProposalAlreadyMaterialized`, pre-flight + under the finalize lock) prevents double-materialize; we did NOT refactor the billing writers for cross-writer atomicity. Close only if a no-cost guard appears. |
| **CF-27.4** | **NTE gate is per-proposal, not cumulative** — each proposal is compared to the job NTE on its own; already-published proposals on the same job are not subtracted, so several draws could individually pass while collectively exceeding the ceiling. | An "already-committed against this job" reader (sum of published proposals / billed amounts) feeding `decideProposalKind`, distinguishing client vs internal commitments. Adjacent to **CF-27.2** (needs a committed-amount basis). | MVP scopes the gate to a single proposal; mitigation today is the **`forceClientReview`** override (route a draw to client review). A cumulative reader is real modelling deferred until the proposal→invoice basis (CF-27.2) lands. |
| **CF-27.5** | **No promote-internal-to-client later** — `internal_billed` is terminal; once a proposal is auto-billed internal, there is no path to reopen it into the client review flow. | A reverse transition (`internal_billed` → a live client status) + reopening the Batch-2 status buckets (`isLive`/`isWithdrawable`/the action buttons) to admit it. | The terminal `internal_billed` is the simpler, safer invariant; reopening it touches the single-live-revision machinery. Operators can instead create a new client proposal. Banked until a real need appears. |
| **CF-27.6** | **No rendered cross-agent draft-review UI** — neither the invoice creator (Phase 26) nor the proposal generator (Phase 27) has a rendered operator screen; both ship server actions + harness only. The proposal review surface additionally needs a **pricing editor** (number-free seed + operator-authored quantity/unit price) and the **routing preview** indicator. | One cross-agent "agent drafts" review surface (list pending/approved/dismissed; per-agent editor; approve/reject/discard/publish), fed by `listInvoiceDraftsForJobDetailed` + `listProposalDraftsForJobDetailed`. | Deliberate (matches Phase 26): a one-off per-agent screen is the wrong home; a shared surface pass gives both agents a rendered review UI at once. The actions are referenced-only until then. |

## Factual updates (no state change)

- **Migration `0048` is now CONSUMED** (`proposal_drafts` + `proposal_reviews` + the `proposals` ALTER
  — `kind` / `internal_billed` / `prop_tenant_kind_status_idx`; applied to prod, 121→123). Next free is
  **0049**.
- **Phase 27's harness uses the ENV MOCK** (`PROPOSAL_GENERATOR_MOCK=1`) — it does **not** override
  `PROVIDER_REGISTRY` (that is the **Phase-25-only** pattern, used there to exercise the real generate
  seam). The proposal money-safety + NTE-gate invariants are proven on the **real** publish/gate code
  under the env mock.

---

## Inherited (roll forward, UNCHANGED)

### Phase-26 banked items (open)
| Id | Item | What's needed | Why deferred |
|---|---|---|---|
| **CF-26.1** | **No agent-assisted breakdown of lazy/lumped vendor invoices** — a single non-itemized vendor charge is kept WHOLE at the vendor total with `lumpFlag=true` (money-safe; never split into invented sub-amounts). A smarter agent that *breaks out* a lumped charge into itemized client lines is not built. | Authored vendor rate-book data to attribute costs, then a breakdown step in the agent. CF-26.1's real blocker is **`vendor_rates` (the authored rate-book), which is still EMPTY** — no rate-book ingestion/authoring surface exists. (`vendor_performance_scores` is now POPULATED by the B-16.4 scorer, but that's quality scoring, not the cost/rate data a lump-breakdown needs — so it does not unblock CF-26.1.) | No rate data to break a lump down safely; keep-whole-and-flag is the correct money-safe floor until that data lands. |
| **CF-26.2** | **Invoice publish partial-failure window** — publish is a NON-atomic sequence (`createClientInvoice` + N×`addClientInvoiceLineItem` before the finalize txn stamps `published_client_invoice_id`). A mid-sequence crash or a concurrent publish can orphan a `client_invoices` DRAFT (never issued, operator-deletable, recoverable). | A no-cost atomicity guard (a `materializing` status value, or a provisional marker before `createClientInvoice`) — each needs a follow-up migration or breaks the `published_client_invoice_id` NULL-means-unpublished semantics. | §2.6 ACCEPTED trade-off: the idempotency guard (`published_client_invoice_id` non-null → `InvoiceAlreadyMaterialized`, pre-flight + under the finalize lock) prevents double-materialize; we did NOT refactor the billing writers for cross-writer atomicity. Close only if a no-cost guard appears. |

*(Phase-26 factual note, historical:* migration `0047` is CONSUMED — `invoice_drafts` + `invoice_reviews`,
prod 119→121; **CF-25.1's "0047 left free" rationale is stale** but CF-25.1 itself stays OPEN.*)*

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
| **CF-24.2** | **Live autonomy trigger** — `autoDispatchDraftForJob` (and now `runInvoiceCreator` / `runProposalGenerator`) is invoked by nothing in app code; no job-creation hook / cron / queue. | OPEN. **§2.3 — permission ≠ readiness.** The governed agents + observability evidence exist; flipping the switch is a deliberate, evidence-informed future decision. **Rolls forward OPEN, unchanged.** (Phase 27 adds a third reviewable-draft agent to the evidence base but wires no trigger.) |

**Phase-24 soft notes (open):** OpenAI is built but dormant / not live-proven (failover verified by
logic, not live traffic; `openai/gpt-5.4` price third-party-sourced — confirm at key-add).

### §9 operator-portal-UI bucket — unfulfilled (rolls forward OPEN)
Roadmap §9 lists `B-14.1 / B-14.3 / B-14.4 / B-15.3 / CF-14.3` under "Retired by v2 phases … (Phases
18/22/28 **as the surfaces land**)." Phases 22–27 built none of those PM/snow/mass-op operator UIs —
they remain **unfulfilled** and roll forward OPEN. §9's wording is **conditional**, so this is not a
false flat retirement; the standing §6/§9 over-attribution watchpoint carries forward.

### Phase-23 banked items (open)
| Id | Item | Status |
|---|---|---|
| **CF-23.1** | Tenant-supplied LLM API keys + self-service AI restrictions in Settings — per-tenant **encrypted key storage** + multi-provider wiring + a Settings UI. "Other agent restrictions" = the Phase-28 condition vocabulary. | **BACKEND SHIPPED (on origin/main; see the CF-23.1 EOF section).** K1–K3b (`0b3cad5`→`a6e02ed`): `tenant_llm_keys` table + `resolveLlmKey`/`setTenantLlmKey` + apiKey build-seam wired through all 5 LLM agents; CF-12.4 dependency now satisfied; Phase-24 multi-provider already satisfied. **STILL OPEN (deliberately deferred):** the **Settings UI** (shares CF-28.1's surface) + **K3c** real-key billing proof (needs a real tenant + prod host). Row stays OPEN until the feature is whole. |
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
| CF-20.1b | *(newly banked)* Cross-job vendor-photo feed in the Phase-18 review inbox. Deferred by decision; the per-job job-detail panel discharges the CF-20.1 spirit. |
| CF-20.2 | Orphan-object sweep (storage keys ↔ `job_attachments.storage_key`). |
| — (soft) | `vendor_documents` could reuse the storage adapter; FB-10a.4 legacy-placeholder backfill not performed. |

### Phase-19 banked items (open)
| Id | Item |
|---|---|
| CF-19.1a | Wall-clock SLA/escalation, pure wall-clock elapsed-in-status (NOT business-hours). **DETECTION shipped (SENT-only, commit 2ba3eaf):** priority×status threshold matrix (`dispatch-sla-rules.ts`, mirrors `STALLED_THRESHOLDS_SECONDS` at the assignment grain) + `isDispatchStuck` classifier (9/9 offline) wired into `listVendorNotAccepted` (priority leftJoin) + a "Stuck" badge + bubble-up on the exceptions queue; browser-verified across all 6 priority tiers. STILL OPEN: the all-statuses expansion (CF-19.1a-statuses) and the reaction/auto-re-dispatch half (CF-19.1a-react, Phase-28-gated on CF-24.2) — see the CF-19.1a session banked-items section at EOF. |
| CF-19.1b | Business-hours / timezone SCHEDULING-DISPLAY: show & set times in the right local zone ("12pm = the store's 12pm"; "follow up at 8am = operator's time"). Needs the `client_location_hours` data layer + `client_locations.timezone` (IANA) + a tz lib (@date-fns/tz). Migration 0055 (hours_source/timezone_source provenance columns) SHIPPED for this thread (sandbox+prod, commit 83c5d4e). Hours/tz data layer + seeder still greenfield. Distinct from CF-19.1a — the SLA clock does NOT depend on this. |
| CF-19.2 | Twilio SMS adapter (a second `SendProvider`). |
| CF-19.3 | No-same-day-on-site exception (blocked on CF-19.1b — it's a scheduling/business-hours concern, not the wall-clock SLA). |
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
| **B-16.5** | **LLM-assisted draft phrasing (provider seam + `ai_prompt_templates`). PARTIALLY RETIRED by Phases 26–27** (invoice creator + proposal generator per-agent shares). **Stays OPEN; residual = NTE negotiator.** |
| CF-16.1 | `source_type` intent-tag enum value on `update_rewrite_drafts`. |
| CF-16.2 | Invoice-aging anomaly rule (extend `flagInvoiceAnomalies`). |
| CF-16.3 | `source_id` polymorphic-meaning doc. |
| RAG-if-outgrows | RAG / embeddings retrieval if the curated knowledge layer outgrows model context. |

### Phase-15 banked items (open)
| Id | Item |
|---|---|
| B-15.1 | Snow service-log capture RUNTIME. |
| B-15.2 | Live weather feed + auto-event-trigger. |
| B-15.3 | Mass-op operator UI + snow operator screens. *(§9 bucket — unfulfilled by Phases 22–27.)* |
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
| **CF-12.4** | **Credential encryption-at-rest. (CF-23.1 tenant-API-key storage depends on this.)** — SHIPPED (`f978fde`: AES-256-GCM secret-crypto util, fail-closed on missing/wrong-size key; harness 13/13). The CF-23.1 dependency is now satisfied. |
| CF-12.5 | External-ingest IF-4 orphan window. |
| FB-10p.1 | Seed fixture rename (`seed-sandbox-phase9*` now seeds phases 9–15). |
| FB-10a.1 | Vendor/client invite & onboarding flow. *(CF-21.2 relates.)* |
| FB-10b.1 | `tenants.type` enum `'vendor'` vestigial (and whether to add `'external'`). |
| CF-11.1–5 | Phase 11 client-portal: proposal reject, priority picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture. |

### Inherited Phase-14 banked items (still open)
| Id | Item |
|---|---|
| B-14.1 | PM Programs UI placement. *(§9 bucket — unfulfilled by Phases 22–27.)* |
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
  drizzle's decoder) — used by the scope, the invoice, **and now the proposal** correction-pairs readers.
- `inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2).
- `job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only; better-auth
  NULL-tenant audit rows.
- **Snow naming care** — `snow_events` ≠ `job_events`; `snow_dispatches` is NOT a vendor-assignment table.
- **drizzle forward-FK ordering** — a referenced table must be declared before the table whose FK
  callback references it (re-applied authoring `agents-invoice.ts` and `agents-proposal.ts`).
- **Vendor updates live in `job_notes` (`origin='vendor'`)**, not `vendor_update_logs`.
- **Migration cadence** — sandbox apply → `-E` contract-verify → prod-confirm gate → prod apply; a
  pre-set shell `DATABASE_URL` survives drizzle-kit's env load — confirm the resolved DB name before
  any prod DDL. (**Phase 27 added migration 0048, applied to prod via this cadence; 0048 consumed,
  121→123.**)
- **Storage seam / Send seam are capture-by-default**; `APP_URL` is the magic-link base; never
  store/log the raw magic-link token (only its `sha256`).
- **Harness teardown under `FK_CHECKS=0` does NOT cascade** — delete children explicitly by tracked id;
  never by a `created_at`/timestamp window. The agent-child `agent_tool_calls` + `agent_decisions` need
  explicit deletion by `agentRunId`. **Phase-27 corollary: the proposal publish MATERIALIZES canonical
  rows — `proposals` + `proposal_line_items` + a `proposal.internal_billed` `job_billing_events` row +
  `audit_logs` — so the proposal harness teardown is LARGER than the invoice harness (which never
  published); delete those explicitly too (established by `check-phase-27.ts`).**
- **Two-NULLs rule (Phase-23)** — NULL cap permissive, NULL measurement restrictive; Phase-24 cost
  analogue (NULL/unknown model excluded, not $0). **Phase-27 NTE analogue: a NULL effective-NTE
  fail-safes to `client` (never auto-bill without a ceiling).**
- **`agent_decisions` requires a synthetic `agent_runs` row** — correction drafts/reviews hang off a
  real run; the harvest reader joins `agent_runs → drafts → reviews`; harnesses seed the full chain.
- **Standalone TS scripts need `export {};`** (module isolation, TS2393) — re-applied in
  `check-phase-26.ts` and `check-phase-27.ts`.
- **Prod-ops scripts vs check-script sandbox guard** — only check harnesses force `_sandbox` (exit 2
  otherwise).
- **Multi-provider keys are PLATFORM env keys** — failover availability = env-key presence; no
  tenant-key storage until CF-12.4 (CF-23.1 boundary); `recordedModel` truthful under failover;
  `PROVIDER_REGISTRY` is mutable DATA (a Phase-25 harness may override `.buildModel`, restoring it in
  `finally`). **Phase-27's harness uses the ENV mock (`PROPOSAL_GENERATOR_MOCK=1`) instead — no
  `PROVIDER_REGISTRY` override needed.**
- **`createdAt` is THE canonical latest-review-per-draft ordering** — the feedback harvest reader and
  the Phase-24 observability reader BOTH dedupe by `created_at` via the ONE shared
  `latestReviewPerDraft` primitive; they MUST NOT diverge. The invoice adapters reuse it; **the proposal
  adapters (`proposalCorrectionPairs`, `proposalApproveAsIs`) reuse it too** (aliasing
  `proposalDraftId AS draftId`); all three other harnesses stayed green, proving no drift.
- **Money-safety as a TYPE constraint** — for an agent that touches money, make the LLM output schema
  **number-free** and join/author the dollars from the source of truth, rather than instructing the
  model not to invent numbers. Re-use the canonical money writers (`billing/totals.ts`); re-resolve
  markup fresh at the materialization boundary. **Phase-27 corollary: number-free works BOTH ways — the
  LLM cannot emit a dollar, AND publish FAILS CLOSED (`ProposalRequiresPricing`) if the operator never
  authored pricing, so a `$0` proposal can never materialize.**
- **Roadmap §6/§9 over-attribute retirements** — CF-19.4 (CF-12), CF-20.3 (CF-13.4), CF-21.1 (B-16.3 —
  discharged) are the running list of §6/§9 claims unsupported by the live bank; **add the §5 "Phase 27
  = AI-assisted dispatch" row** (the proposal generator took that slot — corrected here). The §9 "Phases
  18/22/28" operator-UI bucket is a **conditional** variant — unfulfilled by Phases 22–27, watch it.
  **Verify any "retires/depends-on X" claim against this live bank** (it wins over §6/§9 and handoff
  prose — the encryption item is **CF-12.4** not CF-12.1; B-16.5 retires **per agent**, beginning Phase
  26, advanced by Phase 27, residual = NTE negotiator).

---

## Post-Phase-27 findings (v2.10.x verification)

Surfaced while verifying the proposal generator against live state + the v2.10.1 review UI. These are
NET-NEW to this bank (not inherited).

### MUST-HAVE — Post-create job editing (priority, trade, NTE, ~all fields)
> **→ RESOLVED — SHIPPED in v2.11.0** (full record in the "## v2.11.0 — post-create job editing (SHIPPED)"
> section at the bottom of this file). The original entry below is kept verbatim for history.

**This is a committed near-term build — the headline of the next build unit, NOT backlog.** Jobs are
currently **immutable after creation**: `createJob` is the ONLY writer of `priority_id` /
`primary_trade_id` / `not_to_exceed_amount`; the only post-create mutation on `jobs` is
`current_status_id` (status transitions) and NTE-via-approved-change-orders (computed-on-read; the base
column is never re-set). There is **NO `updateJob` / `editJob` action or UI** anywhere (`createJobAction`
is the only job action; no edit route under `jobs/[id]/`). Consequences observed in live testing:
- **(a)** a job created via a non-manual source (client portal / email / PM / snow) with **null
  priority/trade** can **NEVER resolve an NTE** (every `resolveClientNteRule` rung requires a priority,
  and `createJob` skips resolution when trade OR priority is absent) and **can never be corrected** —
  permanently unroutable-to-internal.
- **(b)** the manual create form has **no NTE field**, so an operator can only get an NTE onto a job via
  a matching `client_nte_rules` row that exists **BEFORE** creation.
- **(c)** typos (e.g. trade / problem description) **cannot be fixed** at all post-create.
**Required operator functionality.** Scope should include an edit surface for **priority, trade, NTE
(direct entry — not only via rules), problem description, and most other job fields**. Design must handle
the downstream effects of editing trade/NTE: re-resolve the NTE? interact with existing change orders?
re-snapshot vs. leave the create-time snapshot? (The single-writer-of-the-NTE-snapshot invariant, 8c.4,
is the thing being reconsidered — do it deliberately.)

### CF-27.7 — Markup-rules (`client_billing_rules`) management UI
> **→ EXPANDED.** Inspection found this markup-rules UI is the **first seam (Seam 0)** of a larger
> client-billing-model system. **Seam 0 in progress** (branch `cf-27.7-markup-rules`) — it closes the
> original entry below. See the full **"## CF-27.7 expanded — client billing models (4-part plan)"**
> section at the bottom of this file.

**Highest-value AR gap after job-edit.** No authoring path AT ALL: no page, no form, **no app-layer
writer (`createClientBillingRule` does not exist)**, no seed. **Prod has 0 rows** → `resolveClientMarkupDefault`
returns `null` → **every published proposal/invoice gets null markup (no margin)**. Confirmed in live
testing: the $315 internal proposal published at **cost-only, no uplift**. Build it by **mirroring the
existing NTE-rules UI pattern** (`clients/[id]/nte-rules`: page + `NteRulesList` + `NteRuleForm` +
`createClientNteRule`/activate/archive writers) for `client_billing_rules`.

### CF-27.8 — Direct NTE entry on job create + edit
> **→ edit-side SHIPPED v2.11.0** (the `jobs/[id]/edit` form has a direct NTE input — blank leaves it
> unchanged). **Create-side STILL OPEN:** the New-job form still has no NTE field.

The manual New-job form has **no `not_to_exceed` input**; an NTE only lands via a pre-existing matching
`client_nte_rules` row at create (the auto-snapshot). Operators should be able to **type an NTE directly
at create AND edit it after** (the edit half is part of the job-edit MUST-HAVE above). Note: **adding an
NTE rule is NOT retroactive** — the snapshot is create-time only (`createJob` is the single writer of
`jobs.not_to_exceed_amount`; `nte.ts` never writes that column), so existing null-NTE jobs **stay null
forever** without job-edit.

### CF-27.9 — Non-manual job sources create incomplete jobs
> **→ PARTLY MITIGATED v2.11.0** — such null-priority/trade jobs are now **editable post-create** (job-edit),
> so they're no longer permanently stuck / unroutable-to-internal. **Root cause STILL OPEN:** the ingest
> sources still allow null priority/trade at creation.

`create-client-job` (client portal), `ingest-email`, `pm/generate-visits`, `pm/approve-visits`,
`snow/dispatch-sites` can create jobs with **null priority/trade**, which both yields a null NTE and
(today) **cannot be corrected**. Either **require those fields at those sources** or rely on the job-edit
MUST-HAVE to fix after creation. (The operator manual form already requires trade + priority, D-4.7 — so
this is specifically the non-manual ingest paths.)

### CF-27.10 — Proposal cosmetics: default title
Published proposals show **"Untitled proposal"** — the agent / publish flow sets no `title`. Minor; set a
sensible default (e.g. derived from the problem description, or `"Proposal — <trade> <date>"`).

### CF-27.11 — Per-trade prompt specialization
`ai_prompt_templates` has **no trade dimension**; the `variant` column is the latent hook, but
`resolveActivePrompt` is **always called with `variant="default"`**. Per-trade prompts (distinct
proposal/scope/invoice prompts per trade) would need **agent-code changes** (pass `variant=<trade>`) **+
per-variant seed rows**. Deferred — build only if single-prompt draft quality proves insufficient per
trade.

### CF-27.12 *(soft)* — Priority vocabulary check
Observed a job Priority value of **"Scheduled,"** which reads more like a status / urgency than a
priority level (low / normal / high / emergency). Worth confirming the priorities-table vocabulary is
intentional. Low priority; **note only.**

---

## v2.11.0 — post-create job editing (SHIPPED)

Branch `v2.11.0-job-edit` (commits `5b3de8d` writer · `4d6687b` harness · `58d318f` UI + build fix).
Resolves the **MUST-HAVE** above. Recorded here so the bank reads as history (the original entry is
annotated, not deleted).

### What shipped
- **Editable fields** via `updateJob(input: { tenantId, jobId, actorUserId, patch })`:
  `priority_id`, `primary_trade_id` (warn-not-block post-dispatch), `not_to_exceed_amount` (direct
  entry), `client_location_id` (**same-client only** — `LOCATION_CLIENT_MISMATCH` guard),
  `problem_description` (**source-locked**: editable for `manual` / `preventative_maintenance` /
  `snow_event`; locked for `internal_client_portal` / `external_client_portal` / `email_ingestion` /
  `forwarded_email` / `api`), and `scope_of_work` (always editable).
- **Dual-write per changed field, one transaction** (mirrors `createJob` step 5–8): typed history
  (`job_priority_history` / `job_trade_history`) and/or `job_events` (`job.priority_changed`,
  `job.trade_changed`, `job.location_changed`, `job.scope_updated`) + one `audit_logs` `job.updated`
  row. A no-op (nothing changed) writes nothing.
- **`nte.adjusted`** billing event on an NTE edit — and **`updateJob` is the DELIBERATE 2nd writer of
  `jobs.not_to_exceed_amount`**, an **accepted change to the 8c.4 single-writer invariant** (recorded:
  `createJob` was previously the sole writer; the effective NTE stays computed-on-read = edited base +
  Σ approved COs).
- **UI:** `jobs/[id]/edit` (pre-filled `JobEditForm` — direct NTE input, same-client location dropdown,
  required priority/trade selects, source-gated read-only description, amber active-dispatch warning via
  `hasActiveAssignment` [SENT+]) + an Edit link on the job detail header. `updateJobAction` wraps the
  writer and reuses `canonicalizeNte` (relocated to `billing/money.ts` — a `"use server"` module may
  only export async functions).
- **Proof:** `db:check:job-edit` **15/0** (history/event/audit dual-write + no-op; NTE 2nd writer +
  `nte.adjusted` + `getEffectiveNte`; same-client + source-lock guards; clear-to-null rejection;
  `hasActiveAssignment`). Build green; one edit live-verified (NTE 500→2500 + trade change → events on
  the timeline).

### Boundaries (by design)
- **`client_id` immutable** — never in the form; changing a job's client would orphan its proposals /
  invoices / assignments / NTE rules.
- **`generated_scope_of_work` / `approved_scope_of_work` out of scope** — owned by the scope-generator
  publish flow.
- **Clear-to-null on priority/trade unsupported** — see CF-27.13 below.

### CF-27.13 *(new, soft)* — clear-to-null on priority/trade not supported
`updateJob` rejects setting priority/trade to null (`PRIORITY_REQUIRED` / `TRADE_REQUIRED`) because the
typed history tables' `to_priority_id` / `to_trade_id` are **NOT NULL** (a history row can't record a
transition *to* null). The null→value fix (the actual use case — correcting a null-priority ingest job)
works cleanly. If "clear the priority/trade" is ever genuinely needed it requires a different design
(skip-history for that transition, or a nullable-`to` redesign). Low priority; **note only.**

### CF-27.14 *(new, soft)* — create-time priority/trade history baseline missing
Pre-existing: `createJob` writes the initial `job_status_history` row (`null → NEW`) but **NOT** initial
`job_priority_history` / `job_trade_history` rows. So priority/trade history starts at the **first edit**
— there's no "created as X" baseline row (the first edit's `from_*_id` is the create-time value, which is
correct, just un-rowed at create). Optional future backfill into `createJob`. Minor; **note only.**

---

## CF-27.7 expanded — client billing models (4-part plan)

The original CF-27.7 (markup-rules UI) was found, on inspection, to be the **first seam of a larger
client-billing-model system**. Recorded here as the canonical plan; the original entry is annotated, not
deleted.

### The three billing models (from the operator)
1. **RATE-SHEET** *(PRIMARY / MUST-HAVE)* — per-client per-trade **agreed billed rates** (e.g. HVAC
   $95/hr, handyman $85/hr, materials at an agreed markup). Bill at the agreed rates; **margin = agreed
   rate − negotiated vendor cost**. The client sees line items at the agreed rates. **NOT supported today.**
2. **COST-PLUS** *(rare)* — the client sees the **vendor's actual invoice cost + an agreed %** on top
   (the existing `markup_percent` path). In cost-plus the vendor/client invoice is a **REQUIRED
   DOCUMENT** (the client is contracted to see cost) — ties to the required-documents feature.
3. **FLAT-DOLLAR** *(occasional)* — a custom per-job dollar amount. **One method per job** (never % and
   flat at once).

### Key inspection findings
- The **shared line-item schema already expresses all three models** — `quantity` + `unit` +
  `unit_price` + `markup_percent` (cost-plus = unit_price is cost + markup%; rate-sheet = unit_price is
  the agreed rate, no markup; flat = one line at the flat amount). **The gap is rate STORAGE + a
  billing-model selector + the authoring flow — NOT the line table.**
- **The required-documents feature does NOT exist** (net-new; zero rows/tables/UI/code).
  `vendor_compliance` is the requirement-with-state template; `jobAttachments` / `vendor_invoices` are
  the file/satisfy side, but no requirement↔file link exists.
- **`vendor_rates` is the proven template** for a `client_rates` table (client × trade × rate_type ×
  amount × unit × effective dates × status).
- **No `billing_model` field exists** anywhere on `clients` or `jobs`.

### Sequenced build plan
- **Seam 0** *(IN PROGRESS — closes original CF-27.7)* — markup-rules UI for
  `client_billing_rules.markup_percent`. The cost-plus money path **already applies markup**
  (`resolveClientMarkupDefault` → proposal/invoice publish); this ships margin **now**. ~350-line clone
  of the NTE-rules UI, **NO migration**. Branch `cf-27.7-markup-rules`.
- **Phase (i)** *(MUST-HAVE — the primary rate-sheet model)* — a **`billing_model` enum on `clients`**
  (`rate_sheet | cost_plus | flat`) + a **new `client_rates` table** (mirror `vendor_rates`: client ×
  trade × rate_type × amount × unit × effective dates × status) + a **rate-sheet management UI**.
  Migration + new table.
  > **→ STORAGE + UI SHIPPED v2.13.0** (branch `v2.13.0-rate-sheet`). See the "Phase (i) — SHIPPED"
  > record below. **Billing-from-rates is NOT yet done** — that's Phase (ii).
- **Phase (ii)** — **rate-based line authoring**: pick trade + hours → pull the agreed rate → emit a
  billed line (`unit_price = rate`, no markup); wire into manual authoring + the invoice/proposal agents.
  Touches the ~1,200-line pricing layer.
  > **→ THE REMAINING PIECE** that makes rate-sheet billing actually *produce bills*. Phase (i) shipped
  > the STORAGE (rates + the `billing_model` selector); nothing yet **resolves** a `client_rates` row +
  > `billing_model` into a billed line. Storage shipped, billing-from-rates still pending.
  >
  > **→ UNIT 1 SHIPPED v2.14.0** (branch `v2.14.0-billing-from-rates`) — manual authoring now resolves
  > a `client_rates` row + the effective `billing_model` into a billed line. See **"Phase (ii) — UNIT 1
  > SHIPPED v2.14.0"** below. **Unit 2 (agent pre-fill) is the remaining piece.**
- **Phase (iii)** — the **required-documents feature** (net-new; mirror `vendor_compliance` + a
  satisfy-link to `jobAttachments` / `vendor_invoices` + a per-client UI) + the conditional **"require the
  vendor invoice when `billing_model = cost_plus`"** client-invoice issuance gate. **Independent of
  (i)/(ii)** — a standalone compliance feature the cost-plus model ties into; must not block rate-sheet.

**MUST-HAVE: Phase (i) rate-sheet** is the operator's primary billing model and the headline of this
expansion (Seam 0 unblocks cost-plus margin first; (i)+(ii) deliver rate-sheet; (iii) is the separate
required-documents feature).

### Phase (i) — SHIPPED v2.13.0 (rate-sheet STORAGE + UI)

Branch `v2.13.0-rate-sheet` (4 batches: `1284727` migration · `d86eb7e` writer · `f7fe4f1` UI · `3dcdf99`
harness). **Storage + UI shipped; billing-from-rates is Phase (ii).**

**Delivered:**
- **Migration 0049** (`0049_married_shape`, **PROD-APPLIED**, 123→124 tables): `client_rates` table
  (client × trade × rate_type × amount × unit × effective/expiry × status; mirrors `vendor_rates`,
  `client_id` swap, no `vendor_location_id`; FK tenant/client CASCADE, trade RESTRICT, created_by SET
  NULL) + **`clients.billing_model` enum** `('rate_sheet','cost_plus','flat')` NOT NULL **default
  `cost_plus`** (behavior-preserving on existing rows).
- **`client-rates.ts` writer** (`listClientRates` w/ trade-name join · `createClientRate` · `archiveClientRate`),
  tenant-scoped, audit-in-txn, `isDecimalStr` validation, **NO `is_default`** (rates coexist) + the
  **`setClientBillingModel`** selector writer (no-op-safe, audits `client.billing_model_changed` from→to).
- **Rate-sheet UI** (`clients/[id]/rates` page + form + list) + the **billing-model selector** on the
  client detail page; three client-billing links now sit together (NTE · markup · rate sheet).
- **`db:check:client-rates` 13/0** — proves rates coexist (no demote), validation, scoped archive, and the
  no-op-safe model change.

**DURABLE PRINCIPLE — contractual-vs-judgment billing split (architecture decision):**
- **LABOR = CONTRACTUAL** → lives in the **rate sheet** (`client_rates`, agreed $/hr per trade). Deterministic,
  operator-authored, the cost side negotiated with the vendor. **Shipped here.**
- **MATERIALS = JUDGMENT** → **NOT** in the rate table. Materials pricing is case-by-case (what was used,
  at what markup) — the **agent suggests and the operator authors** it, the way the proposal/invoice agents
  already work (number-free draft + operator pricing at the gate). A blanket "materials rate" would
  misrepresent judgment as a fixed rate. (A later *agent-refinement* unit may help suggest materials
  pricing, but it never becomes a contractual rate row.)
- Implication for Phase (ii): rate→line authoring resolves **labor** from `client_rates`; **materials**
  stays the operator-authored / agent-suggested path. The two are deliberately different mechanisms.

**Deferred items surfaced this phase (open):**
- **`client_location_id` on `client_rates`** — per-location rate variants. Dropped from 0049 (the
  `vendor_rates` `vendor_location_id` analog); add when per-site rates are needed.
- **`jobs.billing_model`** — per-job override of the client default ("one method per job"). Deferred to
  **Phase (ii)** (the client default suffices for storage; per-job resolution belongs with line authoring).
- **Rate uniqueness / resolution precedence** — overlapping active rates are currently ALLOWED (no
  uniqueness enforced); **most-specific / newest-wins resolution is to be DESIGNED in Phase (ii)** (it's a
  read-time concern, not a storage one).

### Phase (ii) — UNIT 1 SHIPPED v2.14.0 (billing-from-rates: MANUAL authoring)

Branch `v2.14.0-billing-from-rates` (4 batches: `13815ee` migration 0050 · `147b3de` resolver + add-line
wiring · `0203bd6` manual UI trade-pickers · `5c237dc` harness). **Manual authoring now turns a
`client_rates` row + the effective `billing_model` into a billed line. Agent pre-fill (Unit 2) remains.**

**Delivered:**
- **Migration 0050** (`0050_bouncy_jack_flag`, **PROD-APPLIED**, columns-only, table count unchanged at
  124): nullable `trade_id` (FK `trades` RESTRICT) + `rate_type` enum on the **three AR** line tables
  (`proposal_line_items`, `client_invoice_line_items`, `change_order_line_items`) — labor-rate
  PROVENANCE; **vendor (AP) lines excluded** (cost side). Plus **`jobs.billing_model`** nullable enum
  (`rate_sheet | cost_plus | flat`, no default → null = inherit the client's model).
- **`resolveClientLaborRate(tenantId, clientId, tradeId, rateType='hourly')`** — the read side of the
  rate sheet. Specific→general ladder (Rung 1 trade-specific beats Rung 2 general / `trade_id IS NULL`);
  within a rung **NEWEST-active-wins** (`desc created_at` — re-priced sheet supersedes, the deliberate
  opposite of NTE's earliest-wins); **date-valid** (`effective_date ≤ CURDATE() ≤ expiry_date`, nulls
  open); `status='active'`; tenant-scoped. null ⇒ operator authors manually. **Resolves the Phase (i)
  deferred "resolution precedence" open item.**
- **`resolveEffectiveBillingModel(jobModel, clientModel)`** — per-job override precedence:
  `job.billing_model ?? client.billing_model`. **Resolves the Phase (i) deferred `jobs.billing_model`
  open item** (the column shipped in 0050; resolution lives here).
- **Wired into the three AR add-line writers** (`addProposalLineItem`, `addClientInvoiceLineItem`,
  `addChangeOrderLineItem`) via `resolveLaborLineDefault` — a DEFAULT-fill, never a lock: a `rate_sheet`
  **labor/trip** line with a `tradeId` and **no explicit `unit_price`** is priced from the agreed rate
  (`unit_price = rate`, **`markup_percent = null`** — the rate has margin baked in), and `trade_id` +
  `rate_type` are stored as provenance. A **typed `unit_price` always wins** (operator override; no
  provenance stamped). `cost_plus` / `flat` paths unchanged.
- **Manual UI trade-picker** on labor/trip lines (all three editors), shown **only for `rate_sheet`
  jobs**, defaulted to the job's primary trade, **changeable per line** (`loadLaborRatePickerContext`);
  blank price → the agreed rate fills on save. cost_plus/flat editors unchanged.
- **`db:check:billing-from-rates` 14/14** — sandbox-only (exit-2 guard), self-seed/teardown, 0 leftover.

**Browser-verified:** HVAC $95 / Handyman $85 fill on blank labor lines; changing the trade pulls the
other trade's rate (multiple trades' rates on ONE bill — the multi-trade case); a typed $150 wins over
the agreed rate.

**MULTI-TRADE — SHIPPED, not deferred:** the per-line trade picker (pre-filled to the job's trade,
changeable per line) shipped in Unit 1, so **one bill can carry several trades each at its own agreed
rate** (e.g. 1 handyman line + 1 electrician line). Any earlier "deferred" framing of the per-line trade
picker is **superseded** — it is live.

**DURABLE PRINCIPLE held — contractual-vs-judgment (now in BILLING, not just storage):**
- **LABOR = CONTRACTUAL** → resolved from the rate sheet and **now produces billed lines** (was storage
  only in Phase (i)).
- **MATERIALS = JUDGMENT** → never auto-resolved; stays operator/agent-authored. **Proven by harness L4**
  (a materials line with a trade + blank price does NOT force-fill a rate — it requires an explicit
  price), alongside L5 (cost_plus is gated out even when a matching rate exists).

**Unit 2 — REMAINING (agent pre-fill / UX layer):**
- **proposal-generator** pre-fills labor `unit_price` at draft-review for `rate_sheet` jobs (the draft is
  number-free today; the operator would review a populated number instead of a blank).
- **invoice-creator** branches labor lines to the agreed rate (no markup) for `rate_sheet` clients,
  instead of the vendor-cost + `markup_percent` cost-plus path.
- The data-layer add-line branch **already resolves rates**, so both agents **inherit** the behavior via
  the same `add*LineItem` writers — **Unit 2 is the pre-fill/UX layer on top**, not new pricing logic.

> **→ UNIT 2a SHIPPED v2.15.0** (proposal agent pre-fill). The **proposal-generator** bullet above is
> DONE; the **invoice-creator** bullet is now **Unit 2b (REMAINING)**. See **"Phase (ii) — UNIT 2a
> SHIPPED v2.15.0"** below.

**Banked follow-ups surfaced in Unit 1 (open, low-priority):**
1. **Proposal revision line-clone drops rate provenance** — `createProposalRevision` copies line columns
   predating 0050, so a cloned revision loses `trade_id`/`rate_type` (the prices are preserved). Re-copy
   the two provenance columns when desired.
2. **`update*LineItem` does not re-resolve** — editing a line never re-pulls the rate (intended: the
   add-line default is the resolution point; edits are explicit operator values).
3. **Per-line `rate_type` beyond labor/trip** — the resolver accepts any `rate_type`, but the add-line
   default map is currently `labor→hourly`, `trip→trip_charge`; `emergency`/`after_hours`/`per_unit`
   resolution per line is available in the resolver but not yet surfaced in the manual UI.

### Phase (ii) — UNIT 2a SHIPPED v2.15.0 (proposal agent pre-fills agreed labor rates)

Branch `v2.15.0-proposal-rate-prefill` (`8e457b4` build · `025cc2c` harness). **The proposal agent's
review now opens with `rate_sheet` labor lines PRE-FILLED at the agreed rate — the operator reviews a
populated number, not a blank — with rate provenance recorded on publish.**

**Delivered:**
- **`enrichWithAgreedRates`** (inside `listProposalDraftsForJobDetailed`) seeds `suggestedUnitPrice` on
  **pending-review** labor/trip lines for `rate_sheet` jobs — a **parallel, READ-TIME-only field**: the
  number-free `proposed_proposal` is **NOT mutated** and the read-only approved view is untouched
  (decision-B / no aliasing). Non-rate_sheet / null primary trade / no rate on file → no suggestion
  (blank, exactly as before). Memoized per category → ≤2 rate lookups regardless of line count.
- **Review-editor pre-fill** (`proposal-drafts-section.tsx`): `toEditable` seeds the unit-price input
  from the suggestion (`unitPrice ?? suggestedUnitPrice ?? ""`); a small **"agreed rate"** chip (green)
  shows while the price equals the suggestion and flips to **"overridden"** (amber) the moment the
  operator types a different number. Still a plain editable input — override is free.
- **Provenance threaded submit→publish with SERVER re-verification** (the decision-B core): the editor
  submits `trade_id`/`rate_type` **only** while the price is unchanged; `publishProposalDraft` +
  `addProposalLineItem` then **re-resolve the agreed rate server-side** and record `trade_id`/`rate_type`
  + **`markup_percent = null`** ONLY when the explicit price still **equals** the agreed rate. A
  typed-over price OR a since-changed (stale) rate **drops provenance honestly** and bills the reviewed
  number with normal markup. Never trusts the client's tag.
- **Single provenance authority** — `addProposalLineItem` (via `resolveAgreedRateProvenance`) is the one
  place that decides provenance, so the **agent publish path and the manual add-line path behave
  identically**.
- **Shared per-line markup helper** (`resolveAgreedRateLineMarkups`) feeds BOTH the routing **preview**
  and the **publish** gate, so **preview total == published total** for an agreed-rate proposal (an
  agreed-rate line is unmarked-up on both sides; the NTE-gate basis stays byte-identical to the
  persisted total).
- **`db:check:proposal-rate-prefill` 10/10** — sandbox-only (exit-2 guard), self-seed/teardown, 0
  leftover. Proves **E1–E4** (rate_sheet labor pre-fills; materials/cost_plus/null-trade do not), **P1**
  (agreed-rate line records `trade_id`/`rate_type` + null markup, server-verified), **P2** (override
  ≠ agreed rate → provenance dropped, rule markup applies), **P3** (stale rate → provenance dropped,
  bills the reviewed price), **PV1** (preview == publish).

**Verified via the live data loader (real DB, read-only):** Apple Job #2 (HVAC, rate_sheet) → the
pending draft's **8 labor lines pre-fill `$95.00`** (the HVAC agreed rate) with the HVAC trade stamped,
the **trip line blank** (non-labor never pre-fills); Apple's **plumbing** jobs (no PLUMB rate on file)
→ labor **blank**. The resolver **discriminates per trade** — same client, different job trade,
different fill.

**MONEY-SAFETY held:** the LLM stays **number-free**; the pre-fill is **deterministic resolution** of
operator-entered `client_rates` (never AI pricing); the pre-filled price is a default the **operator
overrides freely**; and the server **re-verifies** provenance before stamping it (no false agreed-rate
labels).

**Phase (ii) UNIT 2b — REMAINING (invoice agent rate-sheet branch):**
- For **`rate_sheet` clients**, the invoice-creator's **labor** lines should bill the **agreed rate**
  — **decoupled from vendor cost, no markup** — while **materials** stay **cost-plus** (reconciled to
  the vendor cost line). The labor-vs-materials split is the crux.
- The data-layer branch in **`addClientInvoiceLineItem`** already exists (it resolves the agreed rate
  and forces null markup when a trade is passed — wired in Unit 1). 2b is **threading the trade into the
  agent's draft + teaching the invoice-creator draft model the labor-vs-materials cost split** — a
  **behavioral change** to draft generation, **not just a parameter**: the agent currently reconciles
  *every* client line to a vendor cost line, and for rate_sheet labor that coupling is wrong (labor
  bills the rate regardless of what the vendor charged; materials still reconcile).

> **→ UNIT 2b SHIPPED v2.16.0.** Materials land **BLANK** (operator judgment) rather than cost-plus —
> the design evolved from the "materials stay cost-plus" framing above to "rate_sheet materials are
> operator-priced with a vendor-cost reference." See **"Phase (ii) — UNIT 2b SHIPPED v2.16.0"** below.

### Phase (ii) — UNIT 2b SHIPPED v2.16.0 (invoice agent rate-sheet branch)

Branch `v2.16.0-invoice-rate-sheet` (8 commits: `ccc1e05` draft-build fork · `ea1c39e` materials/chip/
provenance · `4d85444` harness · `7c3f3e9` RSC fix · `329a8ff` time-unit rule · `29f2192` Unit field ·
`666dd26` gate removal). **The invoice agent now bills `rate_sheet` clients from the agreed rate sheet
(labor) while leaving materials/lumped for the operator — decoupled from vendor cost — and never blocks
client billing.**

**Delivered (the draft-build fork — `invoice-creator/index.ts`):** the agent forks at draft-build on the
job's **effective `billing_model`**:
- **`cost_plus` / `flat` → BYTE-IDENTICAL** to pre-2b (vendor cost + rule markup, every line; regression-
  guarded by harness D5).
- **`rate_sheet`:**
  - **Itemized labor/trip** — a vendor line with an **explicit TIME UNIT** (`isTimeUnit`: `hr`/`hrs`/
    `hour`/`hours` + the man-hour family; case-insensitive, whitespace/punctuation stripped) → **fills
    the agreed rate** (`unit_price = rate`, `quantity = vendor hours`, extended = qty × rate), **markup
    null**, `trade_id`/`rate_type` provenance + `suggestedUnitPrice`; the review editor shows an
    **"agreed rate"/"overridden"** chip (mirrors Unit 2a).
  - **Lumped labor (no time unit) + bare-quantity + materials/other → BLANK** for the operator, **no
    markup**, with the **vendor cost surfaced as a read-only `vendor: $X` reference** beside each line
    (mark up / sanity-check on the spot). The vendor cost is **reference-only under rate_sheet** — it
    NEVER drives the billed price.
- **Publish provenance is server-RE-VERIFIED** (`addClientInvoiceLineItem` via `resolveAgreedRateProvenance`
  — the same single-authority pattern Unit 2a added to the proposal writer): `trade_id`/`rate_type` are
  recorded ONLY when the explicit price still **equals** the agreed rate; a typed-over or stale-rate
  price drops provenance and bills the reviewed number.
- **`db:check:invoice-rate-sheet` 13/13** — sandbox-only (exit-2), self-seed/teardown, 0 leftover. Mock
  LLM (no reconciliation) → the join loop maps seeded vendor lines verbatim, so the real fork runs on
  controlled category/unit/cost. Covers D1 (unit=hr fills), D1b (`hrs` variant fills — flexible
  recognition), Dbare (qty-only → blank), D2/D3/D4 (lump/materials/no-rate → blank), D5 (cost_plus byte-
  identical), P1–P4 (provenance recorded / override drops / materials no-markup / cost_plus unchanged).

**Browser-verified LIVE (Apple Job #3, real DB):** itemized labor (`unit=hr`) drafted at the agreed
**$95**, NOT the vendor **$72**, with the **"agreed rate"** chip + **"vendor: $72"** reference; the
lump (**$300**) and materials (**$50**) came up **blank** with their vendor references; typing **120**
on the labor line flipped the chip to **"overridden"**.

**CONSERVATIVE DETECTION RULE (durable principle):** fill the agreed rate **ONLY on an explicit time
unit**; **blank everything else** (blank is the SAFE failure). Rationale: **20k+ vendors, no uniform
invoice format**, and hours are often hidden in lumps (a `qty 1 / $500` line can be 2 men × 5 hr). A
**wrong auto-fill bills garbage**; a **blank costs a quick operator fill**. `isTimeUnit` is a **pure
util** (`src/server/billing/labor-units.ts`, no directive — mirrors `money.ts`/`vendor-invoice-status.ts`)
**reusable by CF-27.15** (operator-enters-hours).

**FOUR GAPS found by LIVE VERIFY and fixed — none catchable by harness/tsc:**
1. **RSC boundary bug** (`7c3f3e9`) — `canDraftClientInvoice` lived in a `"use client"` module, so the
   **server** vendor-invoice list could not invoke it ("cannot invoke a client function from the server").
   Fixed: relocated the pure predicate to `src/server/billing/vendor-invoice-status.ts` (plain util).
   Pre-existing latent bug; first fired when a vendor invoice existed (the gated row renders only then).
2. **Detection on the `unit` field too blunt** (`329a8ff`) — the batch-1 "any non-empty unit ⇒ itemized"
   rule mis-handled real data → replaced with the conservative `isTimeUnit` rule.
3. **Vendor-invoice line editor had NO `Unit` input** (`29f2192`) — the rule keys on `unit`, but the
   intake form never collected it (operators kept typing "hr" into Description) → the auto-fill was
   **unreachable through normal intake**. Added a `Unit` input (action + data layer already stored it).
4. **Invoice agent required job status `=== "COMPLETED"`** (`666dd26`) — a status **no code path could
   produce** (the lifecycle gap), which also **wrongly blocked** multi-vendor / early / late-cancel
   invoicing → **gate REMOVED** (the vendor invoice is the only precondition).

**PRINCIPLE LOCKED — NEVER block client billing.** No job-status gate, no duplicate block, no dispute
block. Client-invoicing **tracks VENDOR WORK, not job completion**: a multi-vendor job bills each vendor
invoice independently (bill Vendor A now while Vendor B drags on), and even a **late-cancelled** job with
a vendor trip charge is billable. **operator-always-wins, applied to revenue.**

**BANKED NEXT PIECES:**
- **CF-27.15 — operator-enters-hours-at-review.** For a BLANK labor line, the operator types the hours →
  fills `hours × agreed rate` (reusing `isTimeUnit` / the rate resolver). The **durable answer to messy
  inbound** vendor invoices (where hours aren't itemized with a clean time unit).
- **CF-27.16 — architectural rethink.** Client-billing is currently a **downstream join off a vendor-
  invoice document**; it should arguably track the **work-unit / dispatch directly**. Revisit when
  **per-dispatch status** lands.
- **Minor:** the vendor-line **EDIT** form (if ever built — none exists today, add+remove only) needs the
  `Unit` field **and** `updateVendorInvoiceLineItemAction` to read `unit`.

---

## Phase (ii) — COMPLETE ✅ (billing-from-rates)

**Unit 1 v2.14.0** (manual authoring — resolver + add-line wiring + multi-trade picker) ·
**Unit 2a v2.15.0** (proposal agent pre-fills agreed labor rates) ·
**Unit 2b v2.16.0** (invoice agent rate-sheet branch + never-block-billing).

The agreed rate sheet now flows end-to-end: **manual line authoring**, the **proposal agent**, and the
**invoice agent** all resolve `client_rates` → billed lines (labor from the rate sheet, markup null,
provenance), with materials/judgment left to the operator and the LLM kept number-free throughout.

**Remaining in CF-27.7:** **Phase (iii)** — **required-documents + the cost-plus gate** (the documents
a job must carry before its cost-plus billing can close). That is the next piece, independent of the
rate-sheet work shipped here.

> **→ PHASE (iii) SHIPPED v2.17.0.** See **"Phase (iii) — SHIPPED v2.17.0"** below.

### Phase (iii) — SHIPPED v2.17.0 (required-documents + cost-plus gate)

Branch `v2.17.0-vendor-invoice-docs`. **Operators attach the vendor-invoice DOCUMENT to a vendor invoice;
a per-client toggle makes cost-plus issuance ADVISE (never block) when that document isn't on file.** All
three parts harnessed; both migrations (0051, 0052) PROD-APPLIED.

**Part 1 — upload-as-vendor-invoice-document (the first operator attachment surface):**
- **Migration 0051** (`0051_ambitious_carlie_cooper`, **PROD-APPLIED**) — `job_attachments.vendor_invoice_id`
  nullable FK → `vendor_invoices`, `ON DELETE SET NULL`, + index `(tenant_id, vendor_invoice_id)`. **MANY
  docs → one vendor invoice** (0..N). Columns-only, table count 124 unchanged.
- **Capability:** operators attach **tagged** documents to a vendor invoice (`attachVendorInvoiceDocument`,
  put-before-insert, reusing the photo storage seam). **PERMISSIVE MIME** — PDF/Word/Excel/images/csv/txt/
  unknown allowed; **only executables/scripts blocked, by MIME AND filename extension** (`document-mime.ts`,
  pure util). **Body-size 16 MB** (`next.config.ts serverActions.bodySizeLimit`). Tenant-scoped presigned
  GET read. **"Attached documents"** section on the vendor-invoice detail page, shown in **ALL states** (docs
  arrive on their own schedule; attaching changes no money — only the line-item editor stays money-locked).
- **Tag → attachment_type** map: invoice→invoice (the gate's key), signoff→signature, receipt→document,
  photo→photo, other→other.
- **`db:check:vendor-invoice-documents` 15/15.** **Browser-verified** (a `.docx` + `.pdf` uploaded + tagged
  live — permissive types work) **(real-R2 render confirmed 2026-06-17 — see CF-iii.1)**.

**Part 2 — per-client toggle:**
- **Migration 0052** (`0052_chilly_patch`, **PROD-APPLIED**) — `clients.require_vendor_invoice_for_cost_plus`
  boolean `NOT NULL DEFAULT false` (behavior-preserving; existing clients off). Columns-only, 124 unchanged.
- **Toggle UI** beside the billing-model selector (`setClientRequireVendorInvoiceForCostPlus`, mirrors
  `setClientBillingModel`). Advisory-framed copy ("you can always proceed — it never blocks billing").

**Part 3 — advisory cost-plus doc gate at issuance:**
- At cost-plus client-invoice issuance, **WARN (never block)** when the source vendor invoice has **no
  invoice-tagged document** AND the client's toggle is on. **`shouldWarnMissingVendorDoc` is the single
  authority**: effective `cost_plus` (job ?? client) + toggle on + source VI exists + no invoice doc.
- **Pre-computed inline** (warning + "Issue without the vendor invoice document" ack checkbox shown before
  the click — mirrors `forceClientReview`); `sendClientInvoiceAction` **RE-VERIFIES server-side**
  (no-trust-client) + a stale-page belt-and-suspenders re-surfaces it. The ack **always** lets the operator
  proceed.
- **Override audit:** `{ issuedWithoutVendorDoc: true }` in the **`client_invoice.sent` event metadata**,
  ONLY when the warning applied AND was acknowledged (no new event type).
- **`db:check:cost-plus-doc-gate` 11/11.**

**KEY DESIGN (durable):**
- The gate is **ADVISORY, not hard** — **billing ≠ dispatch eligibility** (vendor_compliance is a hard
  floor; billing carries the never-block-client-billing principle, so this warns + lets the operator
  proceed). The ack always proceeds; the override is recorded, never silently bypassed.
- Fires ONLY when **cost_plus + toggle on + source VI exists + no invoice doc** (effective model = job
  override ?? client). A **sign-off doc does NOT satisfy** it — the client is owed the **INVOICE** document
  (the A6 distinction). **Manual** client invoices (no source vendor invoice) **skip** the gate.
- **Many docs per VI** (the everyday case = invoice + sign-off). **Permissive file types** (20k+ vendors
  send everything). **Scope:** started SPECIFIC (the one cost_plus→vendor-invoice rule), structured to
  generalize — no premature `document_requirements` config table.

**TWO PROD FINDINGS from the live verify (roll forward):**
- **CF-iii.1 — PROD-BLOCKER (config, Jonny's action):** Cloudflare **R2 must be configured** in dev
  `.env.local` AND the prod runtime (`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` /
  `R2_BUCKET`). Without them `getStorageProvider()` now throws `STORAGE_NOT_CONFIGURED` (after CF-iii.2;
  previously a **silent capture fallback → data loss**: uploads "succeeded" then evaporated — dev blank-tab,
  prod serverless per-instance ephemeral). **R2 is MANDATORY** for vendor-invoice documents AND photos in
  prod. The code is correct — this is configuration. Jonny sets R2 + re-uploads (the two ORIGINAL
  capture-provider files are not recoverable — but a fresh real-R2 vendor-invoice doc now exists,
  uploaded + verified 2026-06-17; see the dev-discharge note below).
  **DEV HALF DISCHARGED (2026-06-17):** the four `R2_*` vars are set in dev `.env.local` and **verified live**
  against bucket `pm-facilities-attachments` — a round-trip PUT/GET/DELETE passed, and **BOTH R2-gated
  render verifies were confirmed end-to-end**: (1) **operator photo** upload→render (see CF-20.1, RETIRED);
  and (2) **vendor-invoice document** upload→render — a `.pdf` opened via the View link, R2 object present
  at matching 48,941 bytes, `getVendorInvoiceDocumentUrl` returns a live presigned HTTPS URL (not
  `capture://`). **CF-iii.1 stays OPEN for the PROD
  half only:** the prod runtime still needs the same four vars — deferred because no live prod host exists
  yet (set them when prod hosting is stood up).
- **CF-iii.2 — SHIPPED (`a19ce2b`):** the storage factory now **fails LOUD**. Capture is **explicit-only**
  (`STORAGE_CAPTURE=1`, the harness flag); a real runtime with no R2 creds **throws
  `STORAGE_NOT_CONFIGURED`** at the factory chokepoint (protecting BOTH document and photo uploads/reads).
  Closed the silent-data-loss masking. Harnesses unaffected (`cost-plus-doc-gate` re-run 11/11 green).

**STILL BANKED (roll forward):**
- **CF-27.15** — operator-enters-hours-at-review (fills `hours × agreed rate` for a blank labor line).
- **CF-27.16** — client-billing as a work-unit/dispatch entity, not a downstream join off a vendor-invoice
  document (revisit when per-dispatch status lands).
- **Presigned-PUT direct-to-R2** — the upload SCALE answer (client uploads direct to R2, bypassing the
  16 MB Server Action body cap). The provider only presigns GET today; a `getSignedPutUrl` + a 2-step
  client flow is the next storage step when large files / volume demand it.
- **Vendor-line EDIT form** — if ever built (none today; add+remove only), it needs the `Unit` field +
  `updateVendorInvoiceLineItemAction` to read `unit`.

---

## CF-27.7 — BILLING ARC COMPLETE ✅

The whole billing story shipped, end to end:

- **Seam 0 v2.12.0** — the billing seam / foundation.
- **Phase (i) v2.13.0** — rate-sheet STORAGE + UI.
- **Phase (ii) v2.14.0–v2.16.0** — billing-from-rates: Unit 1 (manual authoring), Unit 2a (proposal agent
  pre-fill), Unit 2b (invoice agent rate-sheet branch + never-block-billing).
- **Phase (iii) v2.17.0** — required-documents + the cost-plus gate (vendor-invoice document capability +
  per-client toggle + advisory issuance gate + storage hardening).

From a vendor's cost to the client's invoice — rate-sheet vs cost-plus pricing, the proposal and invoice
agents (LLM number-free throughout), the agreed rate sheet, document attachment, and the cost-plus
entitlement advisory — the arc is complete. **Open carry-forwards:** CF-iii.1 (R2 config — Jonny),
CF-27.15 / CF-27.16, presigned-PUT, and the vendor-line edit-form Unit field.

> **→ CF-27.15 SHIPPED v2.18.0** (see below) — RETIRED from the open carry-forwards above.

### CF-27.15 — SHIPPED v2.18.0 (operator-enters-hours-at-review)

Branch `v2.18.0-operator-enters-hours`. **The Unit-2b lumped-labor blank-line fallback is now a fast,
provenanced hours fill.** The agreed rate was always RESOLVED at invoice draft-build but DISCARDED on
lumped lines (vendor lump / no time unit → hours unknown). Now it's CARRIED onto the blank line as a new
**`agreedRate`** field — distinct from `suggestedUnitPrice` (the line stays blank; no pre-fill, no chip).

- On a blank rate_sheet labor line that has a rate on file, the operator types **hours in Quantity**, clicks
  **"Use agreed rate ($X/hr)"** → `unit_price` = the agreed rate → bills **hours × the contractual rate**,
  fully provenanced (`serialize` emits `trade_id`/`rate_type` when `unitPrice == agreedRate`; publish
  RE-VERIFIES; markup forced null for rate_sheet). The vendor cost is still shown as a reference, and the
  price stays a plain editable input (a raw price is still allowed).
- **Money-safe:** the operator supplies the HOURS (never guessed/invented); only the rate is contractual.
  Harness **P3 proves a blank line never auto-fills** — the fill is operator-initiated only. The chip is
  gated on `unit_price != ""`, so a blank line never falsely reads "overridden".
- **`db:check:operator-enters-hours` 9/9** — D1 (rate carried onto the blank lumped line), D3 (no rate →
  no agreedRate), D2 itemized unchanged, D4 materials none; P1 (5 hrs × agreed 75 → agreed-rate line +
  provenance, extended 375), P2 (raw override → no false provenance), P3 (blank → publish throws).
- **Scope:** invoice review ONLY — the manual line editor already does operator-quantity + rate-fill, and
  proposals have no lumped-vendor-line problem (authored fresh). **No migration** (provenance columns + the
  resolved rate all exist; only the `serialize` condition changed).

**STILL BANKED (roll forward):** CF-27.16 (client-billing as a work-unit/dispatch entity, not a downstream
join off a vendor-invoice document), CF-iii.1 (R2 config — Jonny's action: `R2_*` in dev `.env.local` +
prod), presigned-PUT direct-to-R2 (upload SCALE answer), vendor-line EDIT form Unit field (if ever built).

---

## Phase-19 follow-up pass (2026-06-15) — new banked items

A later pass on the shipped Phase-19 substrate: live-verified the send backend end-to-end and added the
job **follow-up (next action)** feature + the `follow_up_overdue` exception kind (migration 0053, prod-applied
by-name; commits `93c2c68` migration + `1eb0555` feature, local/unpushed at writing). Full detail in
`docs/phase-19-notifications-send/` (01/02/08/09/10/11 — session-update sections). New bank:

| Id | Item | Why deferred |
|---|---|---|
| **FU-1** | **Real-domain send** — verify a domain at resend.com + set `RESEND_FROM` on it (real client/vendor email; today's `onboarding@resend.dev` reaches only the account owner). **[Jonny action]** | Wire proven; needs a verified domain. |
| **FU-2** | **Prod send config (when hosted)** — `RESEND_API_KEY` + verified-domain `RESEND_FROM` on the host, `SEND_CAPTURE` absent. **[Jonny action]** | No prod host yet. |
| **FU-3** | **Create-time follow-up** — set a follow-up at job creation (today: edit-only). | MVP scope; fast follow-on. |
| **FU-4** | **Multi "sticky-note" follow-ups** — several live categorized follow-ups per job, all upcoming visible, each cleared independently. | The designed next-round upgrade; today's single follow-up slots in with no rework. |
| **FU-5** | **Operator hand-send UI** — a clean in-app compose-and-send surface (engine proven; surface thin). | Out of this pass's scope. |
| **FU-6** | **Group-by-job de-dup in the exception queue** — one job can surface under multiple kinds (e.g. `operational` + `follow_up_overdue`). | By design today; tidy later. |
| **FU-7** | **Vendor "not accepted" grace period** — don't flag in the first N minutes after send. | Current behavior flags immediately. |

**CF-19.1 — SPLIT into CF-19.1a (wall-clock SLA) + CF-19.1b (business-hours/timezone scheduling); both STILL
BANKED.** (This paragraph's earlier "business-hours clock" framing conflated the two — corrected here.) The
`follow_up_overdue` overdue timing and the future SLA `due_at` are **CF-19.1a — pure wall-clock, NOT
business-hours-aware**. The JS business-hours logic AND `client_location_hours` data (empty in prod) belong to
**CF-19.1b** (the scheduling/timezone-display feature; its 0055 provenance columns shipped). The rest of the
open bank above (CF-27.16, CF-iii.1, presigned-PUT, vendor-line Unit field) **rolls forward unchanged**.

---

## Per-dispatch status-tracking build — new banked items

Per-dispatch (per-trip) status tracking shipped: `PENDING_INVOICE` job status (seed + reflow, sandbox+prod),
shared `advanceJobStatus`, operator hand-advance (`setAssignmentStatus` + picker), and single-vendor
auto-follow (`ON_SITE→IN_PROGRESS`, `WORK_COMPLETE→PENDING_INVOICE`). Full detail in
`docs/per-dispatch-status-tracking/`. Commits `0959aa2`, `b9b5792`, `120f8f4`, `0dcd202`, `377a9b5`,
`d3db56c`, `a9d722a` (local/unpushed at writing). New bank:

| Id | Item | Why deferred |
|---|---|---|
| **PD-1** | **Work-order PDF packet + resend-to-vendor** — assemble a layered work-order PDF (tenant SOPs + SOW + client SOPs + sign-off sheet) and a send/**resend**-to-vendor action, independent of dispatch status. (Resend matters operationally — vendors lose work orders.) | Out of this build's scope; needs the PDF-assembly + storage/send wiring. |
| **PD-2** | **Cross-job "dispatches by status" operator view** — a tenant-wide list (e.g. all dispatches at On Site / not accepted), not just per-job. | The deferred fast follow-on; per-assignment controls shipped first. |
| **PD-3** | **Multi-vendor job-status coupling rule** — how a job's status resolves when several active dispatches sit at different stages (the auto-follow only fires at exactly one active dispatch today). | Genuinely ambiguous; needs a product rule. Single-vendor covers the common case. |
| **PD-4** | **Tenant-configurable reference-data admin UI** — manage job/dispatch statuses, trades, priorities per tenant (add / rename / reorder). | Reference data is MVP seed-managed; lookup-by-code already insulates the platform, so this is an addition, not a rewrite. |

**CF-27.16 (client-billing as a work-unit/dispatch entity) — STILL BANKED, now UNBLOCKED** by per-dispatch
status + the `PENDING_INVOICE` seam: a single vendor's `WORK_COMPLETE` lands the job at `PENDING_INVOICE`, the
natural trigger/handoff for invoicing → `CLOSED_BILLED`. The rest of the open bank (CF-iii.1, presigned-PUT,
vendor-line Unit field, FU-1..FU-7, CF-19.1a/19.1b) **rolls forward unchanged**.

---

### CF-27.16 SHIPPED v2.21.0 (billing rethink: job-first, work-driven)

**THE FIX (what was antiquated).** Client billing used to key off the vendor-invoice **document**: the AI
invoice-creator drafted FROM a specific vendor invoice, and the launch button sat on the per-vendor-invoice
row. Billing is now **JOB-FIRST / WORK-DRIVEN**. A job reaches the ops→accounting handoff, then accounting
bills the **JOB**, rolling up its dispatches' work + vendor costs. Vendor invoices are demoted to cost
**INPUTS** for margin — never the trigger and never a gate.

**OPERATOR MODEL (the spine).** Vendor side (AP) is per-dispatch and **independent** — never gated on job
status, so a slow Vendor B doesn't block billing the rest. `PENDING_INVOICE` is the **ops→accounting handoff**
(job-level, a prompt not a gate). Client side (AR) bills the **JOB** — mostly one invoice/job, but
multiple-invoices-per-job and bill-an-open-job are supported. **Split BY PORTION = BY DISPATCH.**

**THREE PIECES (all harnessed + live-verified).**

- **Piece 1 — ops→accounting handoff (`markJobReadyToBill` → `PENDING_INVOICE`).** A focused
  operations-gated action (the ops inverse of `markBillingClosed`); operator-judgment with **NO dispatch
  precondition** — multi-vendor jobs are handoffable with incomplete dispatches; purely job-level
  (dispatches / vendor invoices untouched); allowed-from any non-terminal status except already-pending;
  light confirm (reversible); never-block. Harness `db:check:mark-ready-to-bill` **14/14** (H6 multi-vendor
  untouched; H7 never-block). Live-verified.
- **Piece 2 — Ready-to-invoice view (client-aware) on the jobs list.** Additive, `canSeeFinancials`-gated. A
  chip sets `?status=PENDING_INVOICE` (the existing dashboard-card filter mechanism), reveals a **CLIENT
  filter** (accounting batches BY CLIENT — shared requirements), and swaps in billing columns
  (Handoff | Cost | Billed | Margin | Vendors). **Status IS the queue membership** — jobs leave the view when
  billing closes. Base jobs list untouched for operators. Harness `db:check:ready-to-bill-view` **15/15**.
  Live-verified (handoff → appears in view, end-to-end with Piece 1).
- **Piece 3 — job-first "Bill this job" entry.** A deterministic **pre-filled MANUAL** client invoice — NOT
  an agent reshape — which sidesteps `invoice_drafts.vendor_invoice_id` NOT-NULL (no migration) and reuses
  `addClientInvoiceLineItem` (the agreed-rate + provenance authority). Pre-fills ALL work-to-date; the
  operator removes what they're not billing (= the split, via `removeClientInvoiceLineItem`). never-block: no
  vendor-invoice precondition (Job #4 — work done, no vendor invoice — is still billable; no resolvable rate
  → $0 line, not a failure). Harness `db:check:job-bill-prefill` **11/11**. Live-verified ("Bill this job" →
  draft for Job #4 no-invoice + Job #3 multi-invoice; the gate+redirect wrapper confirmed in-browser). Plus a
  **UX polish**: the read-only client-invoice line row now shows the line's **TRADE** (e.g.
  "Labor — Sunbelt HVAC (HVAC) · HVAC") so each line's trade is unambiguous at a glance (display-only;
  surfaced after a live-verify misread the trade against the add-new-line form's default).

**BILLING-MODEL MATRIX (all client-safe — the durable rules).**

| Model | Labor | Materials / lump | Vendor cost exposed? |
|---|---|---|---|
| **rate_sheet** | AGREED RATE (never vendor cost) | $0 — operator prices via judgment | No |
| **cost_plus** | vendor cost + markup | vendor cost + markup | **Yes** — the ONLY model that exposes cost (contractual; clients shown cost by agreement) |
| **flat** | $0 — operator enters agreed amount | $0 | No |

`rate_sheet` + `flat` **NEVER** bill at the vendor cost **NOR leak it into the client-visible line
DESCRIPTION** (the cost-privacy guard — caught in live-verify, harness P7). A no-invoice dispatch →
agreed-rate line with **BLANK hours** (the CF-27.15 shape), `rate_sheet`-only by construction.

**MULTI-TRADE FIX (`84aac6f`, caught by browser-verify).** A line's trade now comes from the **DISPATCH's
matched trade** (the trade that did the work), not the job's primary trade — so a multi-trade job bills each
line at the correct trade's agreed rate (HVAC work → HVAC rate, not the job-primary plumbing rate).
`listAssignmentsForJob` now returns `matchedTradeId`; both prefill branches use it (fall back to primary only
if absent). The harness's old seed implicitly asserted the BUG — corrected to prove dispatch-trade sourcing.
Live-verified: Job #4 line stores `trade_id=HVAC`, bills $95 (HVAC rate).

**BANKED FUTURES (roll forward).**

| Id | Item |
|---|---|
| **CF-27.16-portion** | A dedicated portion-**PICKER** (select-to-include). Pre-fill-all + remove already gives the split; the picker is polish. |
| **CF-27.16-batch** | **BATCH INVOICING** (the endgame Jonny described) — one-click invoice a whole client-filtered batch (mass-create for all ready-to-invoice jobs for a client that MEET CRITERIA). **PREREQ:** a per-job "billing-ready per this client's requirements" check (portal upload, sign-off where required, proposal generated, the cost-plus doc gate — already a "client requirement" primitive). Piece 2's client-filtered view + Piece 3's `billJobAction` ARE its foundation. |
| **CF-27.16-opt1** | Batched `GROUP BY job_id` margin rollup (replace the per-row N+1 in `getReadyToBillRows`) when the ready-to-invoice list routinely runs large (Jonny's ~50-jobs/client batches). |
| **CF-27.16-agent-trade** | The v2.16 `runInvoiceCreator` (agent path) has the SAME job-primary-trade behavior on its itemized labor lines (now the secondary path; lower urgency). Fix it OR retire the per-vendor-invoice agent trigger (job-first is now primary) — either resolves it. |
| **CF-27.16-addform-default** (minor) | The add-NEW-line form on the client invoice defaults its trade to the JOB PRIMARY trade; on a multi-trade job that's arguably a poor default (could default to blank "— select trade —"). Pre-existing, defensible elsewhere, low priority. |

**NOTE (process):** the lint-gate gap — the v2.20 per-dispatch batches gated `tsc` + `build` but not `lint`
(fixed `scripts/check-set-assignment-status.ts` in Piece 1). Ensure the gate sequence includes `pnpm lint`.

**STILL BANKED (unchanged):** CF-iii.1 (R2 config — Jonny), presigned-PUT, vendor-line edit-form Unit field.

---

## AI-assisted dispatch — banked items (v2.24.0)

> Folded in from docs/ai-assisted-dispatch/closeout-carryforwards.md (the feature
> bank rolls into this canonical one). The AI-assisted dispatch build —
> deterministic scorer + re-rank in auto-dispatch + LLM tiebreaker
> (dispatch_tiebreaker_v1, per-tenant firing mode) — shipped at tag v2.24.0,
> verified offline + sandbox (33/0) + a live real-key probe.

| id | item | status |
| --- | --- | --- |
| **CF-AID.1** | Land `dispatch_tiebreaker_v1` prompt/policy defaults in PROD via the gated `SEED_ALLOW_PROD=1 pnpm db:seed:agent-config` (also backfills proposal/invoice prompt defaults if absent). Sandbox-only today. | OPEN. Do at prod LLM-key cutover; precondition-blocked on a real hosted prod. |
| **CF-AID.2** | Manual real-key tiebreak probe (`scripts/probe-ai-dispatch-realkey.ts`, `pnpm run probe:ai-dispatch-realkey`) — live LLM actually selecting the runner-up. | PROVEN (sandbox, dev key): live swap to better-semantic-fit vendor confirmed; gate held. Re-run after any prompt/model/firing change. NOT in CI (billed, non-deterministic). |
| **CF-AID.3** | Dormant scorer inputs: proximity/distance (inert — no location coords; unblocked by CF-22.1), vendor rate/cost (`vendor_rates` empty), `on_time_rate`/`avg_rating` (present but unweighted). | OPEN. Built as dormant slots — weight in when data lands, no scorer rewrite. Not defects. |
| **CF-AID.4** | Operator-facing ranking/tiebreak rationale UI — the ranking + tiebreak reason are recorded to audit/decision metadata but not surfaced in any screen. | OPEN. Candidate for a later dispatch-UI phase. |

---

## CF-19.1a session — banked items (2026)

> From the CF-19.1a detection build (SENT-only shipped, commit 2ba3eaf) + the
> dev-safety/sandbox-verification work (822809d, ccfa576). Detection is done and
> browser-verified; the items below are the open follow-ons + watchpoints.

| id | item | status |
| --- | --- | --- |
| **CF-19.1a-statuses** | All-5-statuses expansion: extend stuck-detection to ACCEPTED/SCHEDULED/CONFIRMED/ON_SITE. Drop-in via the nested status→priority map (only SENT filled today) + the `MAX(job_vendor_assignment_status_history.created_at)` entered-status anchor (sent_at only anchors SENT). Each new status needs its own per-priority thresholds (Jonny-set). | OPEN. |
| **CF-19.1a-react** | Reaction half: auto-re-dispatch on a stuck dispatch (the ranked fallback chain). | OPEN — Phase-28-gated on CF-24.2 (nothing in app code auto-invokes `autoDispatchDraftForJob` yet). |
| **CF-19.1a-react-preprepare** | Pre-prepare-on-stuck convenience — prepare the suggestion DRAFT automatically when detection flags a stuck dispatch (rung 1 is prepare-on-demand: nothing is created until the operator clicks Suggest). A later convenience upgrade; flips on-demand → ready-on-arrival. Still operator-gated to SEND. | OPEN. |
| **CF-19.1a-react-atomictx** | True-atomic `approveRedispatch` — rung 1 uses ordered-with-recovery (ghost-first then send, two independent txns; a post-ghost send failure self-heals via the next stuck-scan). The stronger guarantee = refactor `setAssignmentStatus`/`sendDispatch` to share one `db.transaction` so ghost+send commit atomically. Deferred hardening, not blocking. | OPEN. |
| **CF-19.1a-fmt** | Threshold-note legibility: `humanizeAge` renders the 24h DEFAULT as "1d", which reads oddly next to "2h/4h/8h" tier notes. Consider a consistent "Nh threshold" / "default" formatting pass across all tier notes. | OPEN — cosmetic, low priority. |

> → **RUNG 1 SHIPPED** (2026-06-21, operator-gated suggest-and-confirm): a stuck dispatch
>   surfaces "Suggest replacement" → operator click prepares a re-rank DRAFT (skip tried,
>   cap at 3) → operator "Approve re-dispatch" ghosts the unresponsive vendor (new GHOSTED
>   status) + sends the replacement. Commits `7dfab4b`→`23fa832` (GHOSTED status, migration
>   0056 `replaces_assignment_id` self-FK, decision engine, prepare/approve with the
>   mandatory stuck-still-SENT + plain-send guards, exception-row state, UI). Live-walked on
>   sandbox. **STILL OPEN: the AUTONOMOUS trigger** (auto-fire without operator click) remains
>   gated on **CF-24.2** — rung 1 is human-in-the-loop only. The on-demand→ready-on-arrival
>   convenience is **CF-19.1a-react-preprepare**; the true-atomic ghost+send is
>   **CF-19.1a-react-atomictx** (both OPEN, above).

**Watchpoints from this session:**
- `.env.development.local` is local-only / gitignored — a fresh clone must recreate it (sandbox `DATABASE_URL`) to get sandbox-default `pnpm dev`; otherwise `next dev` falls back to `.env.local` (prod). Worth a README/onboarding line.
- Multi-login awareness: `jnrosero@gmail.com` now exists in BOTH prod (tenant_admin / demo tenant) and sandbox (operator / phase9-seed-tenant) — same email, different identities/passwords. `pnpm dev` defaults to sandbox, `pnpm dev:prod` to prod. "Which env am I in" caution when acting in the dev UI.

---

## Policy-conditions — banked items (2026)

> From the Phase 28 policy-conditions rung (C1+C2+C3, commits `b5f6606`→`2f12c5f`). The
> evaluator + the live-gate wire + the validated setter shipped; the authoring surface is
> the remaining piece. Conditions only ACT once CF-24.2 wires the autonomous trigger.

| id | item | status |
| --- | --- | --- |
| **CF-28.1** | Policy-conditions authoring UI — an in-app per-tenant/per-client editor to compose the conditions vocabulary (amount/trade/priority/client). Today policies are set only via the `set-agent-conditions-policy.ts` script. Shares **CF-23.1**'s Settings-UI surface — build together, not as a separate screen. Surfaces the product decisions on which condition types to expose first + the include/exclude UX. | OPEN. |

---

## Autonomy trigger (Phase 28 T1/T2) — banked items (2026)

> The autonomy trigger that fires re-dispatch without an operator click. The engine (T1) +
> the operator surfaces (T2a per-job, T2b sweep) shipped; one spend-attribution follow-up is open.

**Autonomous re-dispatch trigger — SHIPPED (2026-06-22, sandbox + live-walk verified).**
T1 (`autoRedispatchForStuckAssignment`) — the gate-governed autonomous core: a stuck SENT dispatch → the rung-1 prepare→approve flow run WITHOUT an operator click, behind the SAME gate auto-dispatch uses (kill-switch + autonomyEnabled + token + spend + conditions), system actor (`getSystemUserId()`), idempotent (stuck-still-SENT pre-check + rung-1 `already_suggested`), audited as triggerSource `auto_redispatch` (`auto_executed` / `policy_blocked`). Probe 16/16. **T2a** — the per-job "Auto-retry now" button on the stuck exception row (alongside the manual "Suggest replacement"), fires T1 for one job; probe 9/9 + live-walked (operator clicked, watched Vendor A → GHOSTED, Vendor B → SENT). **T2b** — the tenant-level "Auto-retry all eligible" sweep button: sequential (`for`-await, NOT parallel — the spend-aggregate guard) fire of T1 across all `can_suggest` stuck jobs, aggregate summary, idempotent re-sweep; probe 9/9. Commits: T1 `b59101f`, T2a `89fc02a` (action+button+wiring) + `0bd3409` (walk-seed `WALK_AUTONOMY` mode), T2b (this batch, commit pending). **STILL OPEN:** a SCHEDULED/automatic trigger (cron / HTTP-pinged) is host-dependent and deferred — the manual button is the no-host cut; **auto-dispatch-NEW** autonomy (vs re-dispatch only) is a separate, bigger scope, not built; and **CF-28.2** below.

| id | item | status |
|----|------|--------|
| **CF-28.2** | Aggregate (per-day/per-tenant) committed-$ ceiling does NOT count autonomous re-dispatch sends. `autonomyCommittedJobIds` (`guardrails.ts:157`) sums only `isNull(created_by_user_id)` ("autonomy = system actor"), but T1's autonomous send attributes the replacement assignment to `getSystemUserId()` (non-null, because `setAssignmentStatus.actorUserId` is non-nullable — `auto-redispatch.ts:63`) → re-dispatch sends are excluded from the aggregate sum. The PER-JOB cap (`maxCommittedPerJob`) DOES guard each re-dispatch (proven, T2b probe scenario C); the sequential sweep loop is correct (no race). This is an attribution inconsistency (auto-dispatch-new = null = counted vs re-dispatch = system-user = uncounted), not an acute hole. **OPEN DECISION first:** is a re-dispatch net-new spend at all? (it re-sends the SAME job at the SAME NTE to a different vendor — arguably not net-new). If it should count: either widen `setAssignmentStatus` to accept a null actor (so re-dispatch uses the null/counted actor) OR teach `autonomyCommittedJobIds` to include system-user autonomous sends. Non-urgent. | RESOLVED (ratifies current behavior; per-job retry cap banked as net-new) — see note below |

**CF-28.2 — RESOLVED (operator decision).** A normal autonomous re-dispatch does NOT count as net-new spend against the dollar ceiling. Rationale: a job retrying to find a willing vendor is one piece of work; the retry is the autonomy feature operating as intended. The dollar ceiling stays a clean "total dollars committed" measure. This RATIFIES current behavior — the counter already excludes re-dispatch sends (`getSystemUserId()` non-null vs the `isNull(createdByUserId)` filter); that filter is now intentional, not incidental.

The runaway-trigger risk (a misfiring trigger re-dispatching one job many times, which a ceiling-exempt re-dispatch would NOT catch) is assigned to a SEPARATE guardrail, not the dollar ceiling: a per-job re-dispatch cap (halt autonomous re-dispatch on a single job after N attempts). Two guardrails, two responsibilities — the dollar ceiling caps total committed dollars; the retry cap caps retries-per-job. The dollar ceiling is deliberately NOT overloaded to do both.

**NET-NEW BUILD banked** (deferred — auto-response/Phase-28 territory, host-dependent for the trigger that would exercise it): **per-job re-dispatch cap.** Does not exist yet. The "ceiling-exempt" half is current behavior (ratified); the retry-cap half is unbuilt and banked here as its own item. When the scheduled/autonomous re-dispatch trigger is built (host-gated), the per-job retry cap ships with it as the bounding guardrail.

---

## CF-23.1 — Tenant-supplied LLM keys (backend SHIPPED; UI + real-key proof deferred)

Each tenant can use their own AI provider key (billed to them), falling back to the platform
key when none is set. Backend chain complete and on origin/main:

- K1  `0b3cad5` — `tenant_llm_keys` table (migration 0057), live both DBs.
- K2  `51b9f2e` — `resolveLlmKey(tenantId, provider)` + `setTenantLlmKey` (single-active, revoke-then-insert); decrypt-failure falls back to platform + loud signal, never silent, never leaks the key.
- K3a `48d1235` — apiKey-capable build seam (`buildProviderModel` / `buildCandidates` accept an optional per-provider key); apiKey undefined → env singleton, byte-identical.
- K3b-1 `e5a2f40` — 4 uniform agent orchestrators (`scope_generator`, `update_rewriter`, `invoice_creator`, `proposal_generator`) thread the resolved key; probe 5/5.
- K3b-2 `a6e02ed` — inline `dispatch_tiebreaker` threaded (local `tenantId`; `keySource` beside the existing dispatch `source`, no collision); probe 7/7.

Backward-compat invariant holds at all 5 sites: no tenant key → env singleton = exactly prior behavior.
Proven cold (tsc=0, probes 5/5 + 7/7, residue 0). Depends-on **CF-12.4** (now SHIPPED).

**STILL OPEN (deliberately deferred — pending a real tenant + a real production host):**
- **K3c — real-key billing proof.** Manual, not a sandbox assertion: needs a real `SECRET_ENCRYPTION_KEY` set in the deploy env + a real tenant Anthropic key. The sandbox proves the wiring; only a real call proves the charge lands on the tenant. Proving it against a throwaway dev DB buys nothing — resumes when there is a real tenant + production environment.
- **Settings UI** — the paste-in-your-key surface; shares **CF-28.1**'s authoring surface. Buildable any time; deferred with K3c so the feature ships whole rather than backend-only.

**Carried-forward open items from the K3 build:**
- `buildCandidates` eagerly builds the base candidate then discards it when `failoverOrder` yields candidates — pre-existing micro-inefficiency, banked during K3a, non-blocking.
- K3b-1 coverage boundary: 3 of 4 uniform agents proven by edit-identity (byte-identical diff + tsc-clean) rather than re-seeded live; full mechanism proven end-to-end on the representative `scope_generator`. Conscious, documented scope choice — a future agent diverging from the uniform shape earns its own live proof.
- **DEPLOY DEPENDENCY:** `SECRET_ENCRYPTION_KEY` must be generated fresh and set in each environment (dev + prod) before any tenant key works end-to-end. Fail-closed: unset/wrong-size throws, never defaults. Correctly left unset in `.env.local` until a real deployment exists.

`v2.27.0` tag is intentionally HELD until CF-23.1 is whole (backend + K3c + Settings UI) — the backend
alone is not a release boundary because no tenant can use it end-to-end yet.

---

## Strategic session findings — agent roster + workflow-AI gaps (banked, unbuilt)

Context: strategy settled this session — beachhead is AGGREGATORS first (then vendors, then
clients); product posture is SUGGESTIVE-first with per-tenant/per-agent autonomy dial (matches
the §2.1 opt-in fail-safe-gated invariant). The suggestive floor is largely built; the autonomy
ceiling is the host-gated v2 roadmap. Reframe banked: suggestive is not just the safe v1 — it is
the data-collection engine that generates the correction pairs (Phase 25) that earn autonomy the
right to ship. Suggestive-first is a technical prerequisite for good autonomy, not only a
commercial choice.

CANDIDATE NEW AGENTS (current roster = scope_generator, update_rewriter, invoice_creator,
proposal_generator, dispatch_tiebreaker). Ordered by suggestive-first fit (high-volume/low-stakes
first — trust-building + fastest feedback data):
- Intake parser agent — messy inbound (email/forwarded/terse portal) → structured draft job
  (client/location/trade/priority/description). Front-door agent; kills manual entry on every job;
  low-stakes (draft reviewed before becoming a real job). Pairs with banked email ingestion
  (CF-13.x). TOP candidate.
- Vendor follow-up agent — vendor gone quiet → drafts chase (ETA/schedule confirm). Low-stakes,
  high-volume; attacks "job fell through cracks, nobody chased vendor." Pairs with re-dispatch
  (chase before re-dispatch). TOP candidate.
- Exception triage agent — stalled/at-risk jobs → ranked by what matters (priority client past SLA
  vs routine late) + recommended action. "System watches your back" = mistake-elimination pitch
  made tangible. Highest-VALUE missing agent; medium build.
- Job summary / handoff agent — long job history → tight summary for handoff/client update/status.
  Builds on Phase 16 read-draft bones. Low-stakes.
- Quote/estimate review agent — incoming vendor quote → flags anomalies vs rate sheet before
  acceptance. Billing-adjacent, medium-stakes. Fits the deterministic-rate discipline.
- Closeout/compliance agent — job marked complete → verifies closeout actually complete
  (photos/docs/sign-off) before bill/close. Catches "billed a job that wasn't finished." Low-stakes.
- Duplicate/related-job detector — new job → "same issue as #1182 here 3 weeks ago." Catches
  recurring problems treated as new (mistake + vendor-quality signal). Lower priority, cheap.
- NTE negotiator agent — vendor NTE-increase request → drafts approve/counter/push-back within
  tenant rules. Highest-stakes/adversarial; per roadmap "gate longest, possibly forever." Bank as
  known future agent; LAST to autonomy.

WORKFLOW-AI GAPS / MISSED ITEMS (from the session's "what have we missed" review):
- Trust-ramp observability (roadmap Phase 24) is more central than its phase number implies: it is
  BOTH the bridge that converts suggestive users into autonomy users ("this agent was right 94% of
  the time you approved it — allow it to act under $500?") AND the proof artifact for the sales
  conversation. Re-rank as near-core to the sellable product, not a later nicety.
- Possible over-gating risk: every agent is draft-first. Correct for dispatch/billing, but for
  trivial/reversible/high-volume suggestions (note rewrite, routine scope) universal gating may make
  the suggestive product feel like MORE clicking, undercutting the "makes me faster" pitch. Consider
  a tier: trivial+reversible auto-applies with easy undo vs consequential gates. Open design question.
- NO DEFINED QUALITY BAR per agent for facing a real tenant. The entire pitch is mistake-elimination;
  an agent that suggests a subtle mistake to a warm buyer is an existential risk to the pitch and to
  hard-won trust. Observability PLUMBING is planned (Phase 24) but no STANDARD exists — "good enough
  to suggest" is undefined and unmeasured. FLAGGED AS THE #1 GAP to close before either known
  operator sees the product.

NEXT-STEP (non-build): the load-bearing decision is now standing up a production host to put the
SUGGESTIVE product in front of one of the two reachable aggregator operators — a much smaller,
better-justified bet than session-start (it's "host a finished suggestive product for a warm buyer,"
not "finish autonomy on a belief"). Define the per-agent quality bar BEFORE that exposure.

---

## Per-agent quality bar — design v1 (structure buildable now; numbers calibration-blocked)

The standard for "good enough to suggest" before any agent faces a real tenant's operators. Settled
this session. Threshold-first; per-tenant correctness-grounding (teaching an agent a tenant's own
definition of "correct," e.g. tenant-specific scope norms) is a SEPARATE banked thread (Phase-25
flavored, tenant-scoped few-shot) — NOT in this v1.

MODEL:
- Each agent has a stakes tier (cost of a wrong suggestion WHEN wrong, not how often). The tier sets
  a PLATFORM-ENFORCED FLOOR: the minimum approve-as-is accuracy before that agent may face a real
  tenant's operators or be eligible for the autonomy dial.
- A tenant sets their own accuracy bar as a RAW NUMBER (accuracy dial), adjustable UPWARD from the
  floor, NEVER below it. Floor = platform, non-overridable (§2.4 guardrail logic). Dial above = tenant.
- Tenant-facing control is the raw accuracy number (not named levels) — honest/legible for an
  SLA-literate operator audience; chosen over "Cautious/Standard/Trusting."
- STRUCTURE is buildable now, host-free (tiers, floors, the dial, floor-enforcement). The actual
  PERCENTAGES are calibration-blocked on production approve-as-is data (none exists pre-host). v1 = the
  frame, not the figures.

STAKES TIERS (current 5 agents; corrected this session):
- Tier 1 Low — update_rewriter. Bad rewrite caught instantly, internal, trivially reversed. Lowest
  floor. (Also the agent where universal hard-gating most risks OVER-costing the operator — see banked
  over-gating concern: trivial+reversible may warrant auto-apply-with-undo vs gate.)
- Tier 2 Medium — EMPTY. Noted deliberately: scope moved up to Tier 3; most facilities agents are
  inherently high-stakes. The cheap-mistake agent is the exception, not the rule.
- Tier 3 High — scope_generator, invoice_creator, proposal_generator.
  · scope_generator = STRICTEST floor of the three. Rationale: a bad scope reaches the VENDOR and
    becomes a wrong real-world repair, already out the door before any review surface can catch it;
    invoice/proposal at least face a billing-review surface. "Scopes cannot be bad in any way."
  · invoice_creator — bad invoice hits the client's wallet or platform margin; vendor-cost-leak risk;
    reaches the outside.
  · proposal_generator — WHEN USED, functions as the internal source-of-truth for the client charge
    (independent of vendor invoices, which do NOT translate cleanly to client invoices). A bad
    proposal = a wrong billing basis. High because of what it governs when present. NOTE: proposals
    are OPTIONAL — no proposal-before-invoice requirement; this is a tiering rationale only, not a
    workflow rule.
- Tier 4 Highest — dispatch_tiebreaker. Commits real money to a third-party vendor; ALSO data-blocked
  (no vendor_performance_scores yet), so highest-stakes AND least-proven. Gated longest regardless of
  the dial.

OPEN / DEFERRED within this thread:
- Calibration: the per-tier floor percentages + the approve-as-is measurement, blocked on production
  data. Set once real usage exists.
- Per-tenant correctness-grounding (separate thread): tenant teaches the agent its own "correct"
  (tenant-specific scope/billing norms) via tenant-scoped few-shot. Deeper Phase-25 build, banked apart
  from the threshold model.

---

## MariaDB → Postgres migration — plan (decided; in progress)

Decision: migrate the DB engine MariaDB → Postgres NOW, while it's test-data-only (cheapest window;
Postgres is the better long-term fit for this app — JSON/jsonb, geospatial for vendor service-areas,
multi-tenant scale). Target dev stack: Vercel (free) + Neon Postgres (free). Sizing: medium, wide-but-
shallow — business SQL is nearly dialect-free (~8 INTERVAL/curdate fragments, no exotic MySQL features).
The cost centers are (1) 169 mysqlEnum→pgEnum pattern shift, (2) the harness/driver-shape layer
(46 [rows,fields] tuple-casts, 109 FOREIGN_KEY_CHECKS teardowns, 25 SELECT DATABASE() guards across
~61 scripts), (3) regenerate 58 MySQL migrations as one clean Postgres baseline.

GOVERNING PRINCIPLES:
- All work on a `postgres-migration` branch cut from main. MAIN STAYS ON WORKING MARIADB until the
  app is proven fully green on Postgres locally. Rollback = checkout main. Merge-to-main is a gate.
- Prove on LOCAL Postgres (Docker; fallback Postgres.app) before Neon; prove on Neon before Vercel.
  Infrastructure is LAST — the whole migration is validatable for $0, no accounts, until batch 6.
- Per-batch commits ON THE BRANCH (progress saved); merge-to-main + any host setup are explicit gates.

BATCH SEQUENCE (each: author → prove on local Postgres → halt → report):
- Batch 0 — Setup. Cut postgres-migration branch. Stand up local Postgres (Docker; check first, fallback
  Postgres.app) with pm + pm_sandbox DBs. Swap core wiring: db.ts (mysql2→pg), drizzle.config.ts
  (dialect→postgresql), package.json (drop mysql2/add pg, delete fix-mysql-engine.mjs). Gate: tsc parses.
- Batch 1 — Schema bulk. 47 files / 124 tables: mysqlTable→pgTable, clean-mapping types
  (decimal→numeric, datetime→timestamp, int, 2 autoincrement→serial). Gate: tsc clean.
- Batch 2 — Enums. 169 mysqlEnum→pgEnum (separately-declared named types + migration ordering). Isolated
  because it's a pattern shift, not find/replace. Gate: tsc clean, enums declared+referenced.
- Batch 3 — Baseline migration. Squash to ONE fresh Postgres baseline (drizzle-kit generate, new dialect);
  apply to local Postgres. Gate: baseline applies clean — schema physically builds on Postgres.
- Batch 4 — Harness/driver layer (the hidden cost). 46 [rows,fields]→{rows} casts, 109 FK_CHECKS
  teardowns→TRUNCATE CASCADE / session_replication_role, 25 SELECT DATABASE()→current_database(),
  ~8 INTERVAL/curdate fragments. ~61 scripts. Gate: a representative seed+harness runs green on local PG.
- Batch 5 — Full validation. Run real harnesses (incl. K3b probes) against local Postgres, cold. Gate:
  green from fresh run — the migration is real.
- Batch 6 — Infra (last). Neon free tier → point app at it → harnesses pass on Neon → Vercel deploy.
  Gate: runs on Neon, deploys to Vercel. Only batch needing accounts.
- Then: merge postgres-migration → main (EXPLICIT GATE), only after green on the new stack.

STATE: batches 0–6 COMPLETE + VALIDATED ON NEON (branch postgres-migration; b6 marker d552675). main STILL on
MariaDB, untouched. Migration validated on local pg (48/48 cold) AND Neon cloud pg (baseline 124/68/377 +
representative suite green over pooler/SSL, populated teardown clean, K3b passing). Remaining: MERGE-TO-MAIN gate
(Jonny's call) + Vercel deploy (follows merge). No migration work left.

BATCH 0 DONE (e039e81, on branch): postgres-migration cut from clean main; pm + pm_sandbox created
locally (PG 18.4); db.ts mysql2→node-postgres (Pool, no mode); drizzle.config dialect→postgresql
(dbCredentials.url shape unchanged, valid for pg); package.json mysql2→pg + @types/pg, db:generate
simplified; fix-mysql-engine.mjs DELETED; check-migration-identifiers.mjs KEPT but UNWIRED (needs
port: double-quote matching + 63-char cap before re-adding — do in batch 1/2). Old MariaDB
DATABASE_URL commented in .env.local for rollback. tsc: 5906 errors, ALL schema-dialect, ZERO from
wiring files (gate held).

NEW FINDING → folds into BATCH 4 scope: ~15 scripts/*.ts derive the sandbox DB by regex-matching
`/jonnyrosero_pm` in the old MariaDB URL. That regex will NOT match the new postgres `.../pm` URL,
so per-script sandbox derivation breaks until reworked. Add to batch 4's harness/driver rework
(alongside the 46 tuple-casts / 109 FK_CHECKS / 25 DATABASE() guards). Until batch 4, those scripts
won't correctly target pm_sandbox — do not run them against the new URL before batch 4.

BATCH 1 DONE (44f8b9d, on branch): 46 schema files converted. mysqlTable→pgTable ×124,
decimal→numeric ×58, datetime→timestamp ×51, int→integer ×35, longtext→text ×2, onUpdateNow→$onUpdate
×94, re-sourced mysql-core→pg-core. 2 autoincrement "sites" were comments (schema uses varchar(36)
uuidv7 PKs — no serial needed). Removed MySQL-only { unsigned:true } from 2 integer columns
(job_number, next_number — signed int32 covers them). bigint/time/date clean re-source. tsc 5906→1802,
all residual schema errors are deferred enums (zero non-enum schema errors — conversion clean).

CAVEAT → BATCH 4/5 (behavioral, invisible, important): onUpdateNow (DB-level ON UPDATE
CURRENT_TIMESTAMP, fired on ANY update) became $onUpdate (fires only on Drizzle ORM updates, NOT raw
sql`` UPDATEs). 94 sites, all updated_at columns. Any raw-SQL update path that relied on updated_at
auto-bumping will now silently leave it stale unless it sets updated_at = now() explicitly. MUST audit
raw-SQL update paths in batch 4/5 — no error fires; the timestamp just stops updating.

BATCH 2 DONE (90a0d2d): 130 mysqlEnum call sites → 68 distinct pgEnums in a central
src/server/schema/enums.ts. Column names hopelessly overloaded (status alone = 14 different value-sets) so
pgEnum names could NOT derive from columns — each of 68 got a distinct descriptive name + a SCRIPT-LEVEL
assertion that all 68 pg-type-name strings are globally unique (tsc can't catch a duplicate type-name; it
would only fail at batch-3 migration — guaranteed here instead). Shared value-sets collapsed to one enum
(active/inactive/archived: 37 uses/18 files → 1). Self-caught regression: dead-const removal dropped
lineItemCategoryEnum (5 cross-file importers) — restored as .enumValues re-derived from the pgEnum.
Schema FULLY GREEN; zero mysql-core references remain anywhere in src/.

BATCH 2.5 DONE (ce1ffc7): date-mode correction. pg-core date() infers string; mysql-core date() inferred
Date. Batch 1's date re-source silently flipped 10 date columns Date→string (only 2 surfaced as errors via
ClientRateRow's Date assertion; 8 flipped silently). Added { mode:"date" } to all 10 (client-details ×2,
vendor-details ×8) — restores Date, matches pre-migration behavior, done BEFORE batch 3 freezes the baseline.
Timestamp confirmed NOT flipped (pg-core timestamp() defaults Date — positively verified). tsc 23→21.

LESSON (recorded for the remaining batches): a "mechanical" type re-source can silently change INFERENCE
without erroring. Two instances now: onUpdateNow→$onUpdate (behavior: raw-SQL no longer auto-bumps) and
date()→string (inference flip, mostly silent). RULE for any remaining type swaps: check the INFERRED type,
not just the rename — a swap that compiles can still have changed what the column infers to. Only errors
where a hand-written type asserts the old shape; silent elsewhere.

BATCH 3 DONE (d1c04d8) — MILESTONE: schema physically builds on Postgres. Archived all 58 old MySQL
migrations + 59 meta files to db/migrations/_mysql_archive/ (tracked renames; main untouched). Generated ONE
clean baseline db/migrations/0000_lush_rockslide.sql (2507 lines: 68 CREATE TYPE AS ENUM, 124 CREATE TABLE,
377 ADD CONSTRAINT; double-quoted PG DDL, 0 MySQL idioms). Applied via drizzle-kit migrate (clean on fresh
PG ledger — the historical unreliability was MySQL-ledger-specific) to pm AND pm_sandbox, both exit 0, both
124 tables / 68 enums / 377 FKs / 1-migration ledger, identical. Batch-2's enum-name uniqueness guard
validated here — 68 CREATE TYPE applied with zero collision. tsc unchanged at 21 (DB-only batch).

BATCH 4a DONE (8a12112) — tsc 21→0, whole codebase type-checks on Postgres. The 21 TS7053 were NOT
select-read [rows,fields] sites (the plan's assumption) — they were WRITE-result sites accessing
result[0].affectedRows (mysql2 [ResultSetHeader] tuple). Correct pg equivalent = result.rowCount (NOT
.rows — .rows would have silently broken the affected-row logic). 13 files. rowCount is number|null (vs
mysql2's always-number affectedRows) → 4 sites feeding a >1 comparison got ?? 0 to preserve semantics;
WHERE-clauses verified driver-invariant (rows-matched==rows-changed) so rowCount is the exact equivalent.
LESSON: the driver-shape fix was rowCount for writes, not rows for reads — read the actual error/shape,
not the assumed pattern.

BATCH 4b-1 DONE (e14f074) — MILESTONE: first real execution of app code on Postgres. Converted 12 date-math
fragments across 9 src/ files (tsc-invisible, inside sql`` casts): 7 TIMESTAMPDIFF(SECOND,a,b)→EXTRACT(EPOCH
FROM (b-a))::int (sign verified b-a at every site, incl. LAG/MIN window-wrapped ones), 2 curdate()→current_date,
3 NOW()-INTERVAL n UNIT→NOW()-INTERVAL '1 unit' (retention's parameterized form → NOW()-(n * INTERVAL '1 day')).
GATE was EXECUTION not tsc: a throwaway probe ran one reader per fragment against local pg (schema-only) — 11/11
executed clean, empty results, zero dialect errors (a leftover MySQL fragment would have thrown). Probe deleted
post-verify (ephemeral convention). The batch-1 $onUpdate raw-SQL caveat is effectively RETIRED: only 1 genuinely
raw UPDATE exists (a one-off prod label-rename not touching updated_at); all 116 app updates go through Drizzle
where $onUpdate fires. Harness INTERVAL backdating deferred to 4b-2.

BATCH 4b-2 DONE (62c61fa) — harness layer pg-ported, Neon-safe. Sandbox regex 59 sites + db/seeds/ (missed by
4b-INSPECT, caught at runtime); 6 prod-gated scripts fixed regex-only, prod paths preserved; SELECT DATABASE()→
current_database() ×22 with abort logic intact; guard tuple-casts→.rows; 108 FOREIGN_KEY_CHECKS wrapper lines
removed across 46 teardowns → pure ORDERED DELETES (no session_replication_role — Neon-safe); INTERVAL ×5.
SAFETY GATE proven FIRST: guard aborts on pm, proceeds on pm_sandbox (GUARD_EXIT=0) before any teardown ran.
Teardowns proven on a POPULATED graph (seed-sandbox-phase9: 35 jobs/23 invoices seeded then ordered-deleted to
0 rows, zero FK violations) + id-set + largest (30 deletes) — all clean.

CRITICAL FINDING → new BATCH 4b-3 (blocker before batch 5): 4b-INSPECT's raw-SQL sweep scanned only date-math +
DATABASE(); it MISSED a whole class of app-query MySQL-isms in src/ sql`` fragments. Fixed 4 in 62c61fa
(ON DUPLICATE KEY UPDATE→ON CONFLICT DO NOTHING in jobs.ts job-number allocation; GROUP_CONCAT→string_agg,
backtick-quoting→double-quote, MAX(bool)→MAX((.)::int) in vendor-matching.ts). STILL BROKEN: vendor-matching
"column preferencerank does not exist" (pg lowercases unquoted camelCase aliases; MySQL is case-insensitive).
The class: (1) identifier case-sensitivity on unquoted camelCase aliases/columns, (2) boolean-vs-int semantics,
(3) EXISTS-as-sql<number> returning pg boolean not 0/1 — #3 is SILENT (won't error, returns wrong shape). Cannot
be found by run-and-fix (silent members don't throw) — requires a SYSTEMATIC sweep of every src/ sql`` fragment.
Batch 4b-3 does this BEFORE batch 5, because batch 5's harness run would pass while silent MySQL-isms return
wrong results.

BATCH 4b-3 DONE (fc2034f) — app-query pg-compat, the audit-by-reading batch (silent members can't be found by
running). Confirmed CAST(x AS CHAR)=char(1) on pg (length 1, verified live). Fixed 17 sites in 3 groups:
(A) SILENT 8: CAST AS CHAR→AS text in agent-observability + correction-pairs — a 1-char truncation of draft/edited
JSON in the FEEDBACK-LOOP comparison; ran clean, returned "{". Proven fixed by RESULT (seeded 100-char content →
returned 100, not 1). This was the migration's most dangerous find — invisible to every harness. (B) LOUD 8:
SUM(bool)→SUM(CASE WHEN..THEN 1 ELSE 0 END) (pg has no sum(boolean)). (C) LOUD 1: vendor-matching ORDER BY —
quoted camelCase aliases AND replaced MySQL (x IS NULL) ASC nulls-trick with pg-native NULLS LAST (quote-alone
still threw 42703; corrected at the execution proof). All proven: CAST by result, loud by execution (4 readers
clean). The 4b-3A audit's safe-by-consumption calls held — Number(x)>0 coercions defuse EXISTS-as-number and
bigint→string; no silent members beyond the 8 CASTs. vendor-matching (5 cumulative fixes across b2/b3) now runs
end-to-end.

BATCH 5 RUN (not committed — not fully green) — cold full-harness suite on pg: 29/36 PASS. HEADLINE: pg strictness
is surfacing LATENT bugs MySQL masked (coercion + lax FK) — these are pre-existing defects the engine exposed, not
migration regressions. Zero teardown-ordering FK violations (the deferred 43 ordered-delete teardowns all held at
scale — the batch-5 risk did not materialize). K3b probes pass on pg (tenant-key wiring survives). tsc=0.
The 7 failures classified:
  REAL APP BUG (1): check-vendor-performance — app writes a fraction (0.857) into integer column jobs_on_time;
    MySQL silently coerced to 0, pg rejects (22P02). Corrupts vendor scoring (the data that feeds AI dispatch).
    NEEDS OPERATOR DECISION: is jobs_on_time a COUNT (int, fix the write) or a RATE (should be numeric, fix the column)?
  HARNESS GAP (2): check-job-photos (inserts attachment w/o seeding parent tenant/job — pg enforces FK, MySQL didn't);
    check-email-ingestion (uses MySQL information_schema.STATISTICS/.COLUMNS/KEY_COLUMN_USAGE — port to pg_indexes/pg_catalog).
  LOGIC/TRIAGE (4): check-invoice-rate-sheet, check-job-edit, check-phase-22 (10c preferenceRank audit metadata),
    check-phase-23 — no SQL errors, assertions on values. LIKELY ROOT CAUSE: pg-driver numeric-as-string (pg returns
    numeric cols as strings where mysql2 gave numbers) → string-vs-number comparison failures. To confirm as one
    systematic cause in batch 5.2, not 4 separate bugs.
Fix plan: 5.1 = the 3 clear-cut (vendor-perf once decided, job-photos parent-seed, email-ingestion pg introspection);
5.2 = the 4 logic failures (confirm numeric-as-string root cause, likely one fix pattern). Then re-run batch 5 for green.

SETUP NOTES for the batch-5 re-run (cold sandbox recipe): drop/recreate pm_sandbox → drizzle-kit migrate baseline
→ seed base fixture (seed-sandbox-phase9 provides operator@phase9seed.test + trades incl HANDY + global job/dispatch
statuses; the check-* harnesses reuse these) → seed-system-user WITH DATABASE_URL overridden to pm_sandbox (it targets
DATABASE_URL directly, no sandbox derivation — a bare run hits prod pm) → seed-b16-4/run.ts (vendor-performance oracle).
Then run check-* with --conditions=react-server. Note: macOS has no `timeout` (would exit 127) — run tsx directly.

BATCH 5.1 DONE (ecaf4f0) — 3 clear-cut batch-5 fixes. FIX 1 (real app bug MySQL masked): vendor-performance.ts
onTime name-collision — raw.map computed a RATE into a local named `onTime`, {...g, onTime} clobbered the count,
so jobsOnTime got the rate (0.857 → coerced to 0 on MySQL, always-wrong the whole time). Renamed rate→onTimeRate,
preserved count as onTimeCount, wrote the count to jobsOnTime. Composite score UNCHANGED (still reads the rate).
Proven by result: sample jobs_on_time all int, all <= jobs_completed, on_time_rate matches (e.g. 23/27=85.19%),
zero invariant violations. FIX 2 (harness): check-job-photos now seeds real parent chain (tenants→clients→
locations→jobs) before attachments (MySQL FK-disable → pg enforces), teardown extended. FIX 3 (harness):
check-email-ingestion MySQL information_schema.STATISTICS/.COLUMNS/KEY_COLUMN_USAGE → pg pg_index/information_schema
.columns/table_constraints+constraint_column_usage; tuple-casts→.rows; TABLE_SCHEMA='pm_sandbox'→schema 'public';
assertions preserved. All 3 pass (tsc=0).

BATCH 5 VALIDATED (c03fd77 marker) — cold full-suite re-run: 48/48 GREEN (36 check-* + 12 probe-*) from a fresh
pm_sandbox (drop→baseline 124 tables→recipe: phase9→system-user→b16-4→agent-config, all seeds exit 0). All 7
formerly-failing harnesses EXIT=0; K3b1/K3b2=0; tsc=0; ZERO teardown FK violations across all 48 logs (ordered
deletes held at full scale, cold, populated). MIGRATION VERDICT: across 124 tables / 68 enums / ~61 scripts /
the full app-query layer, ZERO migration regressions — every issue was a pre-existing defect pg exposed
(vendor-performance count corruption silently stored as 0 on MySQL; job-photos unenforced FK), a mechanical
driver-semantics port, or stale test/seed drift. The migration FOUND bugs rather than creating them. Code-and-data
layer DONE and validated on local Postgres.

BATCH 6 DONE (d552675 marker) — Neon cloud Postgres VALIDATED. Baseline applied to Neon neondb (124/68/377,
identical to local, PG 18.4). Then a scoped Neon-connectivity proof (the real value = app queries over Neon's
SSL+pooler, NOT re-proving engine-identical teardowns): created Neon pm_sandbox, applied baseline, seeded the full
recipe (phase9/system-user/b16-4/agent-config all exit 0), ran a representative subset over Neon —
seed-sandbox-phase9 (populated ordered-delete teardown clean, "post-delete rows: 0", zero FK violations),
check-vendor-performance (count-fix holds), check-invoice-rate-sheet (billing), check-phase-22 (dispatch/rank),
probe-k3b1 (tenant-key path) — ALL EXIT=0. The session_replication_role caveat is now EMPIRICALLY closed on the
real cloud engine (pure ordered DELETEs work on Neon as on local). Gotcha caught: naïve sed on the Neon URL
corrupted the username (neondb_owner→pm_sandbox_owner); fixed with anchored regex (/neondb([?]|$)). Only cosmetic:
node-postgres sslmode=require→verify-full deprecation warning (non-blocking; optional hardening later).

CARRY-FORWARD (post-migration polish, non-blocking): tighten Neon SSL mode (sslmode=verify-full or
uselibpqcompat=true) before real production traffic — cosmetic deprecation warning today, not a correctness issue.
