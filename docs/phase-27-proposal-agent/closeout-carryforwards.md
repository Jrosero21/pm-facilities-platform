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
| **CF-26.1** | **No agent-assisted breakdown of lazy/lumped vendor invoices** — a single non-itemized vendor charge is kept WHOLE at the vendor total with `lumpFlag=true` (money-safe; never split into invented sub-amounts). A smarter agent that *breaks out* a lumped charge into itemized client lines is not built. | Authored vendor rate-book data to attribute costs, then a breakdown step in the agent. `vendor_rates` and `vendor_performance_scores` **exist** but carry **no authored rate data** (no rate-book ingestion/authoring surface; B-16.4 confirms `vendor_performance_scores` is unpopulated). | No rate data to break a lump down safely; keep-whole-and-flag is the correct money-safe floor until that data lands. |
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
| B-16.4 | Vendor performance reader + populate `vendor_performance_scores`. *(Tier-3 AI dispatch — the proposal generator took the v2.10.0/Phase-27 slot, so dispatch shifts to a later phase; it remains data-blocked on this. Also CF-26.1's rate-data blocker relates here.)* |
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
| **CF-12.4** | **Credential encryption-at-rest. (CF-23.1 tenant-API-key storage depends on this.)** |
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
