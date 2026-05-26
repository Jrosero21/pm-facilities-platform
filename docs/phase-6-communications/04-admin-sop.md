# Phase 6 — Admin / Internal SOP

Developer/administrator procedures introduced or changed in Phase 6. Builds on Phase 1–5 SOPs (env setup, seeding, the migration pipeline, FK-rule verification, the ephemeral-script + mutate-restore discipline).

> **Prerequisites for every `mysql` command below:** the SSH tunnel open + `MYSQL_PWD` exported (Phase 1 SOP-1.A). `mysql ...` = `mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm`.

## SOP-6.A — Apply the Phase 6 migrations (0010, 0011, 0012)
```bash
pnpm db:generate   # drizzle-kit generate → fix-mysql-engine → check-migration-identifiers
pnpm db:migrate    # apply pending migrations
```
- **`0010`** — communication schema: `communication_logs` (spine) + `outbound_messages` + `inbound_messages` + `email_templates`.
- **`0011`** — `vendor_update_logs` + `portal_update_queue` (schema-only forward-decls).
- **`0012`** — agent substrate: `agent_runs` + `agent_tool_calls` + `agent_decisions` + `update_rewrite_drafts` + `update_rewrite_reviews` + `client_update_logs`.
- Total recorded migrations after Phase 6: **13** (`0000`–`0012`). Short explicit FK prefixes keep names ≤ 64 chars: `cl_`/`om_`/`im_`/`et_` (0010), `vul_`/`puq_` (0011), `ar_`/`atc_`/`ad_`/`urd_`/`urr_`/`cul_` (0012). Always inspect generated SQL before `db:migrate`.

## SOP-6.B — Verify the agent-substrate FK delete rules (18 FKs on migration 0012)
```bash
mysql ... -e "SELECT CONSTRAINT_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA='jonnyrosero_pm'
    AND TABLE_NAME IN ('agent_runs','agent_tool_calls','agent_decisions',
        'update_rewrite_drafts','update_rewrite_reviews','client_update_logs')
  ORDER BY CONSTRAINT_NAME;"
# expect 18: tenant/job/run chains CASCADE; users + published_communication_id + source_draft_id SET NULL
```

## SOP-6.C — The index-count gotcha (assert explicit indexes, NOT total count)
- On InnoDB, **every FK auto-creates a backing index on its referencing column unless an existing index already covers it as a leftmost prefix.** Migration 0012's 6 tables have **11 explicit named indexes + 10 FK-backing = 21 total**. Verifying "exactly 11" fails spuriously.
- **Rule:** assert that **every expected explicit index is present with its compound shape** (e.g. `ar_tenant_agent_created_idx = (tenant_id, agent_id, created_at)`); treat the total as informational. (Same lesson as the 6d 10-vs-9 FK count.)

## SOP-6.D — The MariaDB JSON read gotcha (parse at the read boundary)
```bash
mysql ... -e "SHOW CREATE TABLE agent_decisions\G" | grep metadata
# metadata longtext ... CHECK (json_valid(`metadata`))  — JSON is longtext on MariaDB
```
- Drizzle `json()` **writes** JSON.stringified content but **does not parse on read** for MariaDB longtext — `row.metadata` comes back a **string**. Every data-layer read exposing a json column must `JSON.parse` it (see `listDraftsForJobDetailed`). JSON columns in Phase 6: `email_templates.applicable_channels`, `agent_tool_calls.tool_input`/`tool_output`, `agent_decisions.metadata`. Detect with a probe type-check (string vs object). (L-6.13.)

## SOP-6.E — Rewriter dev workflow (mock vs real LLM)
```bash
# token-free dev / probes — deterministic stub, no key needed:
REWRITER_MOCK=1 NODE_OPTIONS="--conditions=react-server" pnpm exec tsx --env-file=.env.local scripts/<probe>.ts
```
- **`REWRITER_MOCK=1`** (or **no key configured**) routes `generateRewrite` to a deterministic stub — use for every dev iteration. The **real** call needs a key, provisioned in `.env.local`:
  - **Gateway (preferred):** `AI_GATEWAY_API_KEY=...` → model string `"anthropic/claude-sonnet-4-6"`.
  - **Direct Anthropic:** `ANTHROPIC_API_KEY=...` → `@ai-sdk/anthropic` provider, model `"claude-sonnet-4-6"`.
  - **Override the model** with `REWRITER_MODEL` (gateway form `"anthropic/…"`, direct form bare id).
- `resolveRouting()` precedence: `REWRITER_MOCK` > `AI_GATEWAY_API_KEY` > `ANTHROPIC_API_KEY` > mock. `agent_runs.model` records the provider-qualified id for both real paths.

## SOP-6.F — Exercise the substrate without an LLM (committed test stub)
- `src/server/agents/test-stub/` (`test_stub_v1`) is **committed test infrastructure**: a deterministic agent that drives the full runner chain (run + tool_calls + decision + draft) with no LLM. Use it (or `REWRITER_MOCK`) to verify the substrate before wiring a real model — reusable by Phase 7/8/13/16. It is `testOnly: true` in `AGENT_REGISTRY` and **excluded** from `listProductionAgents()` (never surfaces to operators).

## SOP-6.G — Inspect the keeper agent chain (the worked example)
```bash
mysql ... -e "SELECT agent_id, status, model, prompt_version, input_tokens, output_tokens
  FROM agent_runs ORDER BY created_at DESC LIMIT 1;"
# expect: update_rewriter_v1 / succeeded / anthropic/claude-sonnet-4-6 / v1 / 679 / 232  (Job #2 keeper run)
mysql ... -e "SELECT status, (published_communication_id IS NOT NULL) AS published FROM update_rewrite_drafts;"  # published / 1
mysql ... -e "SELECT source_type, channel, visibility, delivery_status FROM communication_logs cl
  JOIN jobs j ON j.id=cl.job_id WHERE j.job_number=2 ORDER BY cl.created_at;"
# expect 2 rows: job_note/client_portal/client_visible/draft  +  client_update/client_portal/client_visible/draft
```

## SOP-6.H — Light up a deferred Phase 6 surface later
- **6e.5 (Phase 6.5):** compose-new + inbound-logging UI on `outbound_messages`/`inbound_messages` (schema ready).
- **Per-client policy (Phase 7):** replace the hardcoded `REWRITER_POLICY` constant with `agent_policies` lookups; the publish gate is the seam.
- **`agent_drafts` unification (Phase 7):** decide shared vs specialized when the scope generator lands.
- **Update logs / queue (Phase 10/12/13):** `vendor_update_logs` (vendor portal writer), `portal_update_queue` (client-portal push + send pipeline) — forward-decls today.
- **Async rewriter runs (Phase 13):** a background runner for email-triggered / bulk rewrites (Phase 6 is sync; ~11 s observed for the keeper run, acceptable for one-offs).
