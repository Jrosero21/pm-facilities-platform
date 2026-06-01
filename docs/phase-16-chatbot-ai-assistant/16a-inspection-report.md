# Phase 16 — 16a Inspection Report

**Status:** read-only inspection sweep (sub-batch 16a). No code/schema/migrations performed.
**Branch:** `phase-16-chatbot-ai-assistant` cut + pushed off `main@33cd741`.
**Scope of this doc:** pure findings, file-path-cited, no recommendations. Forks are framed
separately in `16a-design-proposal.md`.

> **Headline correction to the roadmap §9 guess:** the AI substrate is NOT named `ai_*`.
> The shared agent audit chain is the **`agent_*`** table family (`agent_runs`,
> `agent_tool_calls`, `agent_decisions`, `agent_policies`, `agent_policy_defaults`). The only
> live `ai_*` tables are `ai_prompt_templates` and `ai_prompt_template_defaults` (the prompt
> config layer). Roadmap §9's `ai_scope_generation_logs`, `ai_generated_updates`, and
> `ai_action_logs` **do not exist on prod** (confirmed empirically — Step 5).

---

## 1. The Phase-7 AI seam (Step 3)

### 1.1 Provider abstraction — `src/server/agents/llm-routing.ts`

A single shared routing decision every agent flows through (`resolveAgentRouting(opts)`),
extracted in Phase 7 batch 7c so all agents share one provider seam. Precedence:

1. `<agentMockEnvVar>=1` **OR** `AGENT_MOCK=1` → **mock** (deterministic, no network)
2. `AI_GATEWAY_API_KEY` set → **gateway** mode: a plain `"provider/model"` string (Vercel AI Gateway)
3. `ANTHROPIC_API_KEY` set → **direct** mode: `@ai-sdk/anthropic` with a bare model id
4. none of the above → **mock** (dev never hard-fails on a missing key)

- **Interface/seam:** `AgentRouting` discriminated union (`mock | gateway | direct`);
  `RoutingOptions` carries per-agent env-var names + default model ids.
- **Provider wired:** Anthropic (Claude), reached either via the Vercel AI Gateway
  (`provider/model` string consumed by the `ai` SDK's `generateObject`) or directly via the
  `@ai-sdk/anthropic` package. The Vercel **AI Gateway** path is already the preferred live path.
- **Config read:** entirely from `process.env` — `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY`,
  plus per-agent `<NAME>_MODEL` / `<NAME>_MOCK` overrides (e.g. `SCOPE_GEN_MODEL`,
  `SCOPE_GEN_MOCK`). No key is ever in code.
- **Swappable:** yes. Model id is env-overridable per agent; gateway vs direct is selected by
  which key is present. `recordedModel` normalizes both live paths to the provider-qualified
  form (`anthropic/…`) for `agent_runs.model` provenance.

### 1.2 Scope-generation service — `src/server/agents/scope-generator/index.ts`

- **Signature:** `runScopeGenerator({ tenantId, jobId, triggeredByUserId? })` → `{ runId, draftId }`.
- **Pipeline (fixed, on the shared runner):** `openRun` → read job context (1 auto-logged read
  tool) → resolve DB prompt + policy → LLM transform (`generateScope`) → `logDecision` →
  write draft (auto-logged) → `closeRun`.
- **Output persisted as draft:** YES — exactly the §2.5 draft-pending-review shape. The agent
  writes ONLY `job_scope_drafts` at `status='pending_review'` (`scope-generator/drafts.ts:94`
  `createScopeDraft`). It has **no path** to `job_scope_steps` or job columns — publishing is the
  human-gated `publishScopeDraft` (`scope-generator/publish.ts:43`).
- **No auto-execute:** the scope agent ALWAYS queues for review regardless of policy
  (`auto_executed` is in the disposition enum but never emitted here — `index.ts:60-73`).
- **LLM contract** (`scope-generator/llm.ts`): structured output via `generateObject` + a zod
  `scopeSchema` (steps[], assumptions[], confidence, rationale). System prompt is **DB-stored**
  (not in code); only mechanical user-prompt assembly (`buildScopeUserPrompt`) lives in code.

### 1.3 The shared runner — `src/server/agents/runner.ts` (THE reuse substrate)

The reusable abstraction every agent runs through (introduced Phase 6 6g.a; inherited by Phase
7/8/13 and **explicitly named for Phase 16 chatbot** in the header comment). Owns the audit
chain:

- `openRun(...)` → inserts `agent_runs` (status='running'), returns a `RunContext` with an
  in-run sequence counter.
- `registerTool(ctx, tool)` → wraps any function so each call auto-logs to `agent_tool_calls`
  (records input/output/status; re-throws on error). Tools declare `kind: "read" | "write"`.
- `logDecision(ctx, …)` → appends `agent_decisions` (proposal + reasoning + confidence +
  policyCheck + disposition + metadata).
- `closeRun(ctx, …)` → updates `agent_runs` with status + provenance (model, prompt_version,
  input/output tokens).

This is the logging shape the roadmap mislabeled as `ai_scope_generation_logs`. **Attribution,
prompt version, model, token usage, tenant, timestamps** are all captured — but across
`agent_runs` (run-level provenance) + `agent_tool_calls` (per-tool I/O) + `agent_decisions`
(proposal/reasoning). The scope **draft** itself is in `job_scope_drafts` (immutable
`proposed_steps`), NOT audited to `audit_logs` (agent writes ride the agent substrate;
`audit_logs` records HUMAN actions — see §5).

### 1.4 Agent registry — `src/server/agents/registry.ts` (a Phase-16-ready enumeration seam)

`AGENT_REGISTRY` (id, name, description, inputSourceTypes, outputType, testOnly) +
`listProductionAgents()` which filters out `testOnly`. The header explicitly calls this "the
enumeration seam for Phase 16's chatbot ('which agents are available?')". Current production
agents: `update_rewriter_v1`, `scope_generator_v1` (`test_stub_v1` is testOnly).

### 1.5 Prompt-template model — `src/server/agents/config/prompts.ts` + `schema/agents-config.ts`

- **Tables:** `ai_prompt_templates` (tenant-scoped, versioned) + `ai_prompt_template_defaults`
  (global platform defaults, no `tenant_id`).
- **Columns:** `agent_id`, `variant` (default `'default'`), `version`, `status`
  (draft/active/archived), `system_prompt` (NOT NULL), `user_prompt_template` (NULL in Phase 7),
  `model_hint`, `temperature` (decimal). UNIQUE(tenant_id, agent_id, variant, version).
- **Resolution:** `resolveActivePrompt(tenantId, agentId, variant='default')` falls through
  tenant override → platform default; **fail-closed** (`NoActivePromptError`) so a missing
  prompt never silently degrades. Single-active invariant enforced in the write path
  (`activatePromptTemplate`, atomic demote+promote).
- **Policies (sibling layer):** `agent_policies` (tenant/optional-client) + `agent_policy_defaults`;
  resolution ladder (tenant,client,agent) → (tenant,agent) → default; fail-safe to
  `requiresReview`.

---

## 2. docs/ tree inventory (Step 4) — the chatbot's candidate knowledge source

- **Total markdown files:** 224
- **Total line count:** 17,694 lines
- **Disk size:** 2.1 MB
- **`07-chatbot-knowledge.md` files:** **16** (one per phase 0–15; roadmap's "seven" was a
  guess), totalling **878 lines**. Per-file line counts:

  | Phase | File | Lines |
  |------|------|------|
  | 0 foundation | `docs/phase-0-foundation/07-chatbot-knowledge.md` | 23 |
  | 1 auth-tenancy | `docs/phase-1-auth-tenancy/07-chatbot-knowledge.md` | 108 |
  | 2 clients-locations | `docs/phase-2-clients-locations/07-chatbot-knowledge.md` | 58 |
  | 3 vendors | `docs/phase-3-vendors/07-chatbot-knowledge.md` | 85 |
  | 4 jobs | `docs/phase-4-jobs/07-chatbot-knowledge.md` | 76 |
  | 5 dispatch | `docs/phase-5-dispatch/07-chatbot-knowledge.md` | 68 |
  | 6 communications | `docs/phase-6-communications/07-chatbot-knowledge.md` | 74 |
  | 7 ai-scope-generation | `docs/phase-7-ai-scope-generation/07-chatbot-knowledge.md` | 49 |
  | 8 billing-proposals | `docs/phase-8-billing-proposals/07-chatbot-knowledge.md` | 71 |
  | 9 aggregator-analytics | `docs/phase-9-aggregator-dashboard-analytics/07-chatbot-knowledge.md` | 45 |
  | 10 vendor-portal | `docs/phase-10-vendor-portal/07-chatbot-knowledge.md` | 55 |
  | 11 client-portal | `docs/phase-11-client-portal/07-chatbot-knowledge.md` | 40 |
  | 12 external-portal | `docs/phase-12-external-portal-integrations/07-chatbot-knowledge.md` | 26 |
  | 13 email-ingestion | `docs/phase-13-email-ingestion/07-chatbot-knowledge.md` | 30 |
  | 14 preventative-maint | `docs/phase-14-preventative-maintenance/07-chatbot-knowledge.md` | 32 |
  | 15 snow-operations | `docs/phase-15-snow-operations/07-chatbot-knowledge.md` | 38 |

**Sizing read:** the full docs tree (17.7k lines / 2.1 MB) is the upper bound; the curated
`07-chatbot-knowledge.md` layer is only **878 lines** — small enough to load wholesale at query
time. This is the deciding input for fork **F16-A** (see design proposal).

---

## 3. AI tables: live vs net-new (Step 5) — empirically confirmed

**Live `ai_*` tables (2 only):**
- `ai_prompt_templates`
- `ai_prompt_template_defaults`

**Live `agent_*` tables (the real audit chain, 5):**
- `agent_runs`, `agent_tool_calls`, `agent_decisions`, `agent_policies`, `agent_policy_defaults`

**Roadmap §9 names that are NET-NEW / absent (confirmed empty query result):**
- `ai_scope_generation_logs` — ABSENT (scope logging actually rides `agent_runs/_tool_calls/_decisions`)
- `ai_generated_updates` — ABSENT
- `ai_action_logs` — ABSENT

---

## 4. Read surfaces the assistant will reuse (Step 6)

The assistant summarizes/queries existing readers — it must NOT rebuild them.

**Analytics readers (`src/server/analytics/`), all `(tenantId, …)`-scoped:**
- `countOpenJobsByStatus(...)`, `countOpenJobsByPriority(...)`, `topClientsByOpenJobs(...)`,
  `topTradesByOpenJobs(...)` — `open-jobs.ts`
- `countStalledJobs(...)`, `isJobStalled(...)` — `stalled-jobs.ts`; `isStalled(...)` — `stalled-rules.ts`
- `timeToDispatchDistribution(tenantId)` — `dispatch-timing.ts`
- `timeInStatusDistribution(tenantId)` — `time-in-status.ts`
- `operationalQueue(tenantId, limit=20)` — `operational-queue.ts`
- `countPendingInvoices(...)` — `pending-invoices.ts`
- pure helpers: `percentile`, `summarizeSeconds`, `resolveScheduledStartAt`

**Domain readers:**
- Jobs (`jobs.ts`): `listJobs`, `getJob(tenantId,id)`, `getJobDetail(...)`, `resolveJobsFilters`
- Dispatch (`dispatch.ts`): `getAssignment`, `listAssignmentsForJob(tenantId,jobId)`,
  `getAssignmentDetail`
- Vendors (`vendors.ts`): `listVendors(tenantId)`, `getVendor(...)`;
  matching (`vendor-matching.ts`): `findCandidateVendorsForJob(...)`, `…ByFacets(...)`
- Billing (`src/server/billing/*`): change-orders, client-invoices, proposals, margin, totals, nte, payments
- Client portal (`src/server/client/*`): `list-client-jobs`, `get-client-job-detail`,
  `list-client-invoices`, `list-clients-in-scope`, scoped-locations readers
- Vendor portal (`src/server/vendor/*`): `list-assigned-jobs`, `get-vendor-assignment-detail`,
  `list-assignment-{notes,invoices,attachments}`
- PM (`src/server/pm/*`): `generate-visits`, `run-due-schedules`, `recurrence`, `approve-visits`
- Snow (`src/server/snow/*`): `declare-event`, `dispatch-sites`, `confirm-dispatches`, `index`

**Verification scripts (`scripts/check-*.ts`)** exist per domain (analytics-readers,
client-portal, email-ingestion, external-integrations, pm-generation, snow-dispatch,
vendor-predicates) — the harness pattern Phase 16 will mirror.

---

## 5. Auth context + single source of isolation (Step 7)

**Module:** `src/server/auth-context.ts`. `getAuthContext()` is "the single source of truth for
'who is acting, in which tenant, with which roles'". Returns `AuthContext` (user, sessionId,
memberships, `activeTenant`, `roleKeys`, `isSuperAdmin`).

**Guards (the assistant's retrieval wraps these):**
- `requireAuth()` → `AuthContext` (redirect `/login`)
- `requireTenant()` → `TenantAuthContext` (guarantees `activeTenant`; redirect `/no-tenant`)
- `requireRole(...allowed)` → super_admin always passes; else redirect `/forbidden`
- `requireVendor()` → `VendorAuthContext` (+ resolved `vendorScope: Set<string>`; redirect `/vendor-no-access`)
- `requireClient()` → `ClientAuthContext` (+ resolved `clientScope: Set<string>`; redirect `/client-no-access`)

**Isolation primitive:** `activeTenant.tenantId` is threaded into every reader as the first arg;
vendor/client portals additionally narrow by a resolved scope `Set`. **Role predicates**
(`src/server/role-predicates.ts`, pure): `hasAnyRole`, `canSeeOperations`, `canSeeFinancials`,
`isVendorUser`, `isClientUser`, `canActOnAssignment`, `canSubmitVendorInvoice`. Read-vs-write
asymmetry is explicit (a read panel may extend visibility beyond the write gate).

---

## 6. `writeAuditLog` shape + `audit_logs` (Step 8)

**`writeAuditLog(input)` — `src/server/audit.ts`:** appends one `audit_logs` row. Input:
`{ tenantId?, userId?, actorLabel?, action (required), targetType?, targetId?, metadata?,
ipAddress?, userAgent? }`. **Failures are swallowed** (logged to console, never thrown) — auditing
must never break the main flow.

**`audit_logs` columns (live):** `id` varchar(36) NN · `tenant_id` varchar(36) · `user_id`
varchar(36) · `actor_label` varchar(128) · `action` varchar(128) NN · `target_type` varchar(64)
· `target_id` varchar(36) · `metadata` longtext · `ip_address` varchar(45) · `user_agent` text ·
`created_at` timestamp NN.

**The `ai_action_logs` question (presented, NOT decided):**
- *Ride on `audit_logs` (extend):* schema already carries `action`/`target_type`/`target_id`/
  `metadata`/`actor_label`; an `actor_label='assistant'` + structured `metadata` could capture AI
  actions with zero new tables, and it already holds the human-action audit. Swallow-on-failure
  is acceptable for a side-channel log.
- *Dedicated `ai_action_logs` table:* AI actions have provenance the human audit lacks (run id,
  prompt version, model, tokens, confidence, disposition) — which today already lives in the
  `agent_*` substrate, not `audit_logs`. A chatbot that READS/DRAFTS may not be a "job action" at
  all; forcing it into `audit_logs` could pollute the human-action stream. The existing
  `agent_runs/_tool_calls/_decisions` may already be the natural home (no new table).

  *(Both sides stated; resolution deferred — see fork F16-B / WP-16.1.)*

---

## 7. Grep map (Step 9) — what exists vs net-new

| term | appears? | where |
|------|---------|-------|
| `ai_` | YES | agents config/scope/rewriter, `schema/agents-config.ts`, `schema/agents-substrate.ts`, email ai-assist reader, migrations 0013/0015/0034, seeds |
| `chatbot` | YES (sparse) | `agents/registry.ts`, `agents/runner.ts` (the Phase-16 seam comments), `schema/job-history.ts`, `schema/agents-substrate.ts` |
| `prompt` | YES | scope-actions, runner, config/prompts + errors, both agents' llm/index, test-stub, schema agents-config/substrate, email ai-assist, migrations 0012/0013, seeds |
| `assistant` | **NO** | — (net-new territory) |
| `embedding` | **NO** | — (net-new; no RAG/vector infra exists) |
| `knowledge` | YES (1) | `schema/job-history.ts` only |

**Map summary:** the agent substrate, prompt config, and routing are all present and explicitly
flagged as Phase-16 seams. **`assistant` and `embedding` are entirely absent** — the chat surface
and any retrieval-index machinery are genuinely net-new. No vector/RAG infrastructure exists today.
