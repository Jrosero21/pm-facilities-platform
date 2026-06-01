# Phase 16 — 16b Construction Manifest

**Phase:** 16 — Chatbot & AI Operations Assistant (final roadmap phase).
**Branch:** `phase-16-chatbot-ai-assistant` (off `main@33cd741`).
**Gate:** authored at the 16b manifest gate. No application code / schema / migrations yet.
**Backing inspection:** `16a-inspection-report.md` (the AI seam) + this doc's Step-1 evidence (the
communications draft slot, below).

---

## 1. Phase summary + the empirical correction (carry to closeout/completion doc)

The assistant is a **registered agent** that **READS across domains and DRAFTS via the existing
review gate** — it summarizes/queries existing readers and produces pending-review drafts. It is
NOT a new operational subsystem.

**Empirical correction to roadmap §9 (record for the completion doc):** the roadmap named an
`ai_*` logging family (`ai_scope_generation_logs`, `ai_generated_updates`, `ai_action_logs`).
**None exist on prod.** The live AI substrate is:
- **`agent_*`** (the shared runner audit chain): `agent_runs`, `agent_tool_calls`,
  `agent_decisions`, `agent_policies`, `agent_policy_defaults`.
- **`ai_prompt_templates`** + **`ai_prompt_template_defaults`** (the DB-stored versioned prompt
  config layer).

Phase 16 builds entirely on this existing substrate. The roadmap's `ai_*` log names are
**superseded** and should not be re-introduced.

---

## 2. Locked decisions

| Fork | Decision (LOCKED) |
|------|-------------------|
| **F16-A** | Retrieval = the curated **`07-chatbot-knowledge.md` layer (16 files / 878 lines)** loaded at query time, **+ a `readDoc(path)` tool** for on-demand full-doc fetch. **NO RAG / embeddings** (the 878-line layer fits in context; `embedding` infra is absent and unjustified at this size). |
| **F16-B** | AI actions log via the **existing `agent_*` substrate** (runner: `openRun → registerTool → logDecision → closeRun`). **NO `ai_action_logs` table.** `audit_logs` stays reserved for the human-driven domain-mutation events (e.g. a later draft-approval going outbound). |
| **F16-C** | **RESOLVED per Step-1 evidence below → SLOT EXISTS. Reuse `update_rewrite_drafts` (+ `update_rewrite_reviews`). ZERO migration.** |
| **F16-D** | Phase 16 = **service layer only** (registered agent + tools + draft-landing + logging + harness). **Chat UI defers** to the operator-portal phase (B-14.4 / B-15.3 analog — banked §8). |
| **F16-E** | Harness `scripts/check-chatbot-assistant.ts`, run via `pnpm run db:check:chatbot-assistant`. Assertion groups **A–F** (spec'd §6). |
| **WP-16.1** | Target **ZERO new tables.** Any new table must first prove the existing draft / audit / agent substrate cannot carry it. |

### F16-C evidence (Step 1 — communications draft-slot inspection)

**VERDICT: SLOT EXISTS.** `update_rewrite_drafts` (Phase 6 batch 6g.a — `schema/agents-rewriter.ts`,
data layer `agents/drafts.ts`) is already the agent-authored draft-pending-review slot. It meets
all three criteria:

| Criterion | Field on `update_rewrite_drafts` |
|-----------|----------------------------------|
| (a) review-status with a pending value | `status enum('pending_review','approved','rejected','discarded','published')` default `pending_review` |
| (b) author/origin marking agent-authored | `agent_run_id` varchar(36) **NOT NULL** (FK → `agent_runs`) — every row is provably agent-authored, traceable to the run (and via `agent_runs.agent_id` to *which* agent) |
| (c) review gate / `requires_review` equivalent | the `pending_review` status IS the gate; the formal review row is `update_rewrite_reviews` (decision approve/reject, `edited_content`, immutable `draft_content`); publish is the **human-gated** `publishRewriteDraft` |

Supporting facts:
- `source_type enum('job_note','vendor_update')` is **already polymorphic** — the table is built to
  carry both a client-update draft (`job_note` lineage) and a vendor-direction draft
  (`vendor_update` already in the enum), no ALTER needed.
- `draft_content` is **immutable**; operator edits live on the review row (the §2.5 "what the AI
  produced vs what the human approved" audit).
- The agent has **NO publish path** — `publishRewriteDraft` (`client-updates.ts:59`) is the only
  draft→outbound path, and it is operator-gated, writing `client_update_logs` + a
  `communication_logs` spine row.

**Why no migration:** both Phase-16 draft tools land an agent-authored, job-scoped, text draft at
`pending_review` in `update_rewrite_drafts`. The chatbot is a **distinct `agent_id`** on the run,
so its drafts are already distinguishable from the rewriter's via `agent_runs.agent_id` — no new
column needed to tag origin. **Recommendation: reuse as-is, ZERO migration.**

**One nuance flagged (NOT a draft-landing gap):** the rewriter's *publish* target today is
client-direction (`client_update_logs`, `channel='client_portal'`). An outbound **vendor
follow-up's** eventual publish target (a `communication_logs` spine row, `channel='vendor_portal'`,
`direction='outbound'`) is a **publish-side** concern — and publish is human-gated + deferred with
the chat UI / send pipeline (F16-D, banked §8). Phase-16 draft tools only need to LAND a
pending-review draft, which `update_rewrite_drafts` fully supports for both directions today. An
optional `source_type` enum value to tag draft *intent* is a **non-required** future nicety
(an enum ALTER, never a new table) — explicitly **not** generated in Phase 16.

---

## 3. Schema posture

**Target: ZERO new tables (achieved by the F16-C verdict).** Phase 16 reuses:
- `agent_runs` / `agent_tool_calls` / `agent_decisions` — run + tool + decision logging.
- `ai_prompt_templates` / `ai_prompt_template_defaults` — the assistant's system prompt(s).
- `agent_policies` / `agent_policy_defaults` — disposition policy (fail-safe `requiresReview`).
- `update_rewrite_drafts` / `update_rewrite_reviews` — the F16-C draft-landing slot.
- All existing tenant-scoped readers (analytics, jobs, dispatch, vendors, billing, …).

**The ONLY conditional addition** would have been the F16-C slot **IF Step 1 had found none** — it
DID find one, so **the condition is not triggered.** No migration is planned for Phase 16. (Had it
been triggered, the gated decision would have deferred to 16c as a column add on the best-fit
table, never a new table.)

---

## 4. The agent + its tools

**Registration:** add a `chatbot_assistant_v1` (working id) entry to `AGENT_REGISTRY`
(`src/server/agents/registry.ts`), `testOnly: false`, surfaced by `listProductionAgents()`. Runs
through the shared **runner** (`openRun → registerTool(each tool) → logDecision → closeRun`), so
every tool call auto-logs to `agent_tool_calls` and the turn's outcome to
`agent_runs`/`agent_decisions`. Routing via `resolveAgentRouting({ mockEnvVar:'CHATBOT_MOCK',
modelEnvVar:'CHATBOT_MODEL', … })`; system prompt via `resolveActivePrompt(tenantId,
'chatbot_assistant_v1')`.

**Tools** — each mapped to a roadmap use case; each logged as an `agent_tool_call`:

| Tool | Kind | Roadmap use case | Backing surface |
|------|------|------------------|-----------------|
| `searchKnowledge(query)` | read | app-usage Qs, SOP/reference lookup | the 16 `07-chatbot-knowledge.md` files (loaded at query time, F16-A) |
| `readDoc(path)` | read | fetch a full doc on demand | filesystem read, **path-allowlisted to `docs/`** (platform-level, not tenant data) |
| `summarizeJob(jobId)` | read | summarize a job's history | `getJobDetail` + `listCommunicationsForJob` + `listJobNotes` |
| `identifyStalledJobs()` | read | surface stalled work | `countStalledJobs` / `operationalQueue` / `isJobStalled` (analytics) |
| `identifySlaRisks()` | read | SLA-risk triage | `timeToDispatchDistribution` / `timeInStatusDistribution` |
| `summarizeVendorPerformance(vendorId?)` | read | vendor performance Qs | `listVendors` / `getVendor` / vendor-matching readers |
| `flagInvoiceAnomalies()` | read | billing anomaly flags | `countPendingInvoices` + billing readers (margin/totals) |
| `recommendNextAction(jobId)` | read | advice (read-only, no mutation) | composes the read tools above |
| `draftClientUpdate(jobId)` | **write** | draft a client update → **pending_review, NOT sent** | inserts `update_rewrite_drafts` (`source_type='job_note'`) at `pending_review` |
| `draftVendorFollowUp(jobId)` | **write** | draft a vendor follow-up → **pending_review, NOT sent** | inserts `update_rewrite_drafts` (`source_type='vendor_update'`) at `pending_review` |

**Write boundary (explicit):** only the **two draft tools** write, and they write **only** a
`pending_review` draft (the §2.5 gate). **No tool mutates domain state and no tool sends anything
outbound.** Publishing a draft remains the existing human-gated `publishRewriteDraft` — outside the
agent, outside Phase 16's write surface.

---

## 5. Construction slice order (16c onward)

Small batches; each its own inspect → apply → verify. No code yet — files-and-why only.

| Slice | Goal | Files (and why) |
|-------|------|-----------------|
| **16c** | Agent registration + runner wiring + routing/prompt seam | `agents/registry.ts` (add entry); new `agents/chatbot-assistant/{index.ts,llm.ts,tools.ts}` skeleton; `agents/config` (no schema — reuse). A `db/seeds` prompt-default row for `chatbot_assistant_v1` (seed, not migration). Why first: establishes the agent identity + the logged run shell everything else hangs off. |
| **16d** | Knowledge tools (F16-A) | `agents/chatbot-assistant/knowledge.ts` — `searchKnowledge` + `readDoc` over the 16 `07-chatbot-knowledge.md` files, `docs/`-allowlisted. Why second: pure read, no tenant data, smallest blast radius; proves the tool+log loop. |
| **16e** | Reader-backed read tools | wire `summarizeJob` / `identifyStalledJobs` / `identifySlaRisks` / `summarizeVendorPerformance` / `flagInvoiceAnomalies` / `recommendNextAction` to existing analytics + domain readers, each threading `activeTenant.tenantId`. Why third: read-only but tenant-scoped — exercises the isolation guard (§7). Reuse readers; build none. |
| **16f** | Draft tools + landing (F16-C) | `draftClientUpdate` / `draftVendorFollowUp` → `createRewriteDraft`-style insert at `pending_review` in `update_rewrite_drafts`, via the runner write tool. Why fourth: the only write surface; lands last so the read substrate is proven first. NO publish path. |
| **16g** | Harness (F16-E) | `scripts/check-chatbot-assistant.ts` + `package.json` script `db:check:chatbot-assistant`. Why: gates the phase; groups A–F (§6). |
| **16h** | Closeout | the 11 standard phase docs under `docs/phase-16-chatbot-ai-assistant/` + carryforwards + completion doc recording the §9 `ai_*` correction. |

---

## 6. Harness spec (F16-E)

**File:** `scripts/check-chatbot-assistant.ts` · **Run:** `pnpm run db:check:chatbot-assistant`
(run with `--conditions=react-server` for the server-only imports). **Sandbox-only hard-exit
guard** (refuse to run against a non-sandbox DB), **destructive + self-seeding** off the
**phase-9 sandbox seed** (`seed-sandbox-phase9*`, which per FB-10p.1 now seeds phases 9–15).
Ephemeral — deleted before the closeout commit (results land in the commit message + docs).

| Group | Asserts | Concrete expected outcome |
|-------|---------|---------------------------|
| **A — registration & run shell** | the agent registers + a run opens/closes | `listProductionAgents()` includes `chatbot_assistant_v1`; a turn writes one `agent_runs` row (status `succeeded`) + ≥1 `agent_tool_calls`. |
| **B — knowledge tools** | `searchKnowledge`/`readDoc` return expected docs | a known query (e.g. "how does dispatch work") returns the phase-5 knowledge doc; `readDoc('docs/phase-5-dispatch/07-chatbot-knowledge.md')` returns its body; a path **outside `docs/`** is rejected. |
| **C — reader-backed read tools** | read tools match the underlying readers | `identifyStalledJobs()` count == `countStalledJobs(...)`; `summarizeJob(seededJob)` reflects the seeded job's status/notes. |
| **D — draft landing** | draft tools land `pending_review`, logged | `draftClientUpdate(job)` inserts ONE `update_rewrite_drafts` row, `status='pending_review'`, `agent_run_id` set; a matching `agent_tool_calls(kind='write')` + `agent_decisions` row exist. |
| **E — cross-tenant isolation (poison case)** | a tenant-A turn never reads tenant-B rows | seed a tenant-B job; call a read tool under tenant-A scope referencing tenant-B's id → returns empty/NOT_FOUND, never tenant-B data. Run every read tool through the `requireTenant`/`activeTenant.tenantId` path. |
| **F — no domain mutation from a draft generation** | drafting changes nothing outbound | snapshot `communication_logs` / `client_update_logs` / `job_status_history` counts before+after `draftClientUpdate`/`draftVendorFollowUp`; deltas are **0**. Only `update_rewrite_drafts` (+ agent_* logs) grew. No `delivery_status='sent'`, no publish. |

---

## 7. Tenant-scope discipline

Every **operational** read tool threads `activeTenant.tenantId` through the existing isolation
guard (`auth-context.ts`: `getAuthContext` → `requireTenant`; `activeTenant.tenantId` is the first
arg to every reader). Vendor/client-scoped reads additionally narrow by the resolved
`vendorScope`/`clientScope` sets. **Docs are platform-level** (the knowledge tools are NOT
tenant-scoped — `07-chatbot-knowledge.md` is shared product knowledge); **all operational data is
tenant-scoped.** Group E is the enforcement test.

---

## 8. Forward-bank

**New Phase-16 banked items (open):**

| Id | Item | Why deferred |
|----|------|--------------|
| **B-16.1** | **Chat UI surface** — the conversational front-end (App Router route group + `ai` SDK streaming) over the Phase-16 service layer. | Engine is Phase 16; UI defers to operator-portal (B-14.4 / B-15.3 analog). |
| **B-16.2** | **RAG / embeddings retrieval** — index the full docs tree if the curated layer outgrows context. | Post-MVP; the 878-line curated layer fits in context today (F16-A). |
| **B-16.3** | **Draft→outbound publish for assistant drafts** — operator review+publish of assistant-authored `update_rewrite_drafts` (incl. a vendor-direction publish target on `communication_logs`). | Publish is human-gated + UI-bound; defers with B-16.1. |
| **CF-16.1** | **`source_type` enum value to tag draft *intent*** (optional) — only if a reader needs to distinguish chatbot-authored from rewriter-authored drafts beyond `agent_runs.agent_id`. | `agent_id` provenance suffices today; an enum ALTER (never a new table) adds only if a reader needs it. |

**Inherited (roll forward UNCHANGED — confirmed verbatim from
`docs/phase-15-snow-operations/closeout-carryforwards.md`):**

- **Phase-15 open:** B-15.1 (snow service-log capture runtime), B-15.2 (live weather feed +
  auto-event-trigger), B-15.3 (mass-op operator UI + snow operator screens), B-15.4 (snow
  dashboard read surface), CF-15.1 (`spawned_count`/`skipped_count` columns on `snow_events`).
- **Inherited bank (from the Phase-15 roll-forward):** CF-13.1 (autonomous high-confidence
  auto-create — email), CF-13.2 (live email receiver), CF-13.3 (real deterministic + AI email
  extractor), CF-13.4 (email attachment physical storage), CF-13.5 (`external_system_id` on
  `email_ingestion_accounts`), CF-13.6 (email approve→link orphan window), CF-13.7 (operator email
  review-queue UI); CF-12.1 (full-workflow auto-push), CF-12.2 (live external adapter), CF-12.3
  (operator mapping UIs), CF-12.4 (credential encryption-at-rest), CF-12.5 (external-ingest IF-4
  orphan window); FB-10p.1 (seed fixture rename — `seed-sandbox-phase9*` seeds phases 9–15),
  FB-10a.1/.3 (operator vendor/client-updates inbox + invite/onboarding), FB-10l.2/.3
  (visibility-promotion workflow; `requires_review` undefined), FB-10b.1 (`tenants.type` enum
  `'vendor'` vestigial / whether to add `'external'`), CF-11.1–5 (proposal reject, priority
  picker, invoice line detail, full-HTTP routing smoke, multi-client client-user fixture).
- **Inherited Phase-14 bank (still open):** B-14.1 (PM Programs UI placement), B-14.2 (live cron /
  scheduler trigger), B-14.3 (per-location scope/trade override on a PM membership), B-14.4
  (mass-dispatch + generic mass-update UI), B-14.5 (`pm_assets` lightweight cap), CF-14.1 (PM
  checklist result instantiation), CF-14.2 (operator authz gate on `approvePmVisits`), CF-14.3 (PM
  program/schedule CRUD UI).

**Standing watchpoints carried forward:** pnpm not npm; name the DB explicitly (WP-12.1); pre-name
FKs >64 chars (WP-12.2); MariaDB-JSON parse-at-read; read verdicts from file + true exit (§10);
`inbound_emails` ≠ `inbound_messages` (WP-13.1); stale `tsconfig.tsbuildinfo` → `rm` it (WP-13.2);
`job_status_history` index growth; TZ-skew in seeds; route-level `loading.tsx` only; better-auth
NULL-tenant audit rows.
