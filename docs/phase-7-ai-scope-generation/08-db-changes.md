# Phase 7 — Database Changes

## Summary
Three migrations add **9 tables**; **zero `jobs` column changes** (the scope columns — `generated_scope_of_work`, `approved_scope_of_work`, `scope_generation_status` — already exist from Phase 4, created forward per D-4.6 [`scope_generation_status` is `varchar(32)`, not an enum — Phase 7 owns the lifecycle]; the values are enforced in app code, not converted to an enum). All InnoDB / utf8mb4 / utf8mb4_unicode_ci, app-generated UUID v7 PKs. FK names use short module prefixes (R-6.22): `apt_`/`aptd_`/`ap_`/`apd_`/`st_`/`sts_`/`jsd_`/`jsr_`/`jss_`.
- **`0013_dark_nemesis`** — agent-config substrate (4): `ai_prompt_templates`, `ai_prompt_template_defaults`, `agent_policies`, `agent_policy_defaults`.
- **`0014_yummy_wong`** — scope template forward-decls (2, schema-only): `scope_templates`, `scope_template_steps`.
- **`0015_salty_katie_power`** — scope generation I/O (3): `job_scope_drafts`, `job_scope_reviews`, `job_scope_steps`.

Total recorded migrations after Phase 7: **16** (`0000`–`0015`); total tables **66**. The three migrations were verified to apply **byte-identically from-scratch** (drop + re-apply matched the incremental schema).

## Migration 0013 — agent-config substrate
Tenant tables keep `tenant_id` NOT NULL; platform defaults live in sibling tables with **no `tenant_id`** (OQ #3 — the resolver falls through tenant → defaults, so no `OR tenant_id IS NULL` query pollution). Config lifecycle `status` enum = `draft`/`active`/`archived` (default `draft`); distinct from the operational soft-delete enum.

- **`ai_prompt_templates`** (`apt_`) — `id` PK · `tenant_id` → tenants (**cascade**, NN) · `agent_id` varchar(64) NN · `variant` varchar(64) NN default `default` · `version` int NN default 1 · `status` · `system_prompt` text NN · `user_prompt_template` text (NULL ⇒ agent assembles in code) · `model_hint` varchar(64) · `temperature` decimal(3,2) · timestamps. **`UNIQUE(tenant_id, agent_id, variant, version)`** (`apt_tenant_agent_variant_version_unique` — blocks duplicate versions, **not** duplicate actives) + `apt_lookup_idx(tenant_id, agent_id, variant, status)`. FK `apt_tenant_fk` (cascade).
- **`ai_prompt_template_defaults`** (`aptd_`) — same columns **minus `tenant_id`**, no FK. **`UNIQUE(agent_id, variant)`** (`aptd_agent_variant_unique` — F1: single-row-per-key, no retained version history; defaults are upserted, not versioned).
- **`agent_policies`** (`ap_`) — `id` PK · `tenant_id` (cascade, NN) · `client_id` (**nullable** → clients **cascade**) · `agent_id` NN · `policy` **json** NN · `version` · `status` · timestamps. **No unique** (the nullable `client_id` + MariaDB NULL-as-distinct make one unreliable — single-active is the R-7.1 write-path invariant); `ap_lookup_idx(tenant_id, agent_id, client_id)`. FKs `ap_tenant_fk` + `ap_client_fk` (both cascade).
- **`agent_policy_defaults`** (`apd_`) — `id`, `agent_id` NN, `policy` json NN, `version`, `status`, timestamps; no FK; **`UNIQUE(agent_id)`** (`apd_agent_unique`, F1).

## Migration 0014 — scope template forward-decls (schema-only, OQ #2 / AC-11)
Roadmap §9 core tables, shipped as schema only — **no seed, no UI, no code path reads or writes them** in Phase 7 (the D-6.17 forward-decl precedent; isolated in their own migration so the "shipped but untouched" status is self-documenting). `tenant_id` NOT NULL (OQ #3 — no platform-library-via-NULL). Shape mirrors `job_scope_steps` so a future template explodes 1:1 into it.
- **`scope_templates`** (`st_`) — `id`, `tenant_id` (cascade), `name` varchar(255), `trade_id` → trades (**set null**), `description` text, `status` (soft-delete enum), timestamps; `st_tenant_idx`.
- **`scope_template_steps`** (`sts_`) — `id`, `tenant_id` (cascade), `template_id` → scope_templates (**cascade**), `step_order` int, `instruction` text, `category` varchar(32), `expects_photo` boolean, timestamps; `sts_template_order_idx(template_id, step_order)`. No own soft-delete status (pure child).

## Migration 0015 — scope generation I/O
Specialized (not a shared `agent_drafts`), settling D-6.16. Reuses the Phase 6 agent substrate via the `agent_run_id` FK — **no parallel run/audit tables**. Draft = JSON working memory; published = relational child (OQ #5). Index shapes mirror `urd_`/`urr_`/`cul_`.
- **`job_scope_drafts`** (`jsd_`) — `id` · `tenant_id`/`job_id`/`agent_run_id` (all **cascade**, NN) · `proposed_steps` **json** NN (the AI's ordered steps, immutable) · `status` enum(`pending_review`,`approved`,`rejected`,`discarded`,`published`) default `pending_review` (**mirrors `update_rewrite_drafts` 1:1**, OQ #4) · `published_at` datetime · timestamps. FKs `jsd_tenant_fk`/`jsd_job_fk`/`jsd_run_fk` (cascade). Indexes `jsd_tenant_job_idx`, `jsd_tenant_status_idx`, `jsd_run_idx` (mirror `urd_*`; the rewriter's `urd_source_idx` is **not** translated — a scope draft has no polymorphic source).
- **`job_scope_reviews`** (`jsr_`) — `id` · `tenant_id` (cascade) · `draft_id` → job_scope_drafts (**cascade**, NN) · `reviewer_user_id` (**set null**) · `decision` enum(`approve`,`reject`) NN · `edited_steps` **json** (NULL when unchanged — information-carrying, like `update_rewrite_reviews.edited_content`) · `review_notes` text · `reviewed_at` datetime NN · `created_at`. Index `jsr_draft_idx`. Append-only (no `updated_at`).
- **`job_scope_steps`** (`jss_`) — the canonical published scope (R-7.2, written only by `publishScopeDraft`). `id` · `tenant_id`/`job_id` (**cascade**, NN) · `step_order` int NN · `instruction` text NN · `category` varchar(32) · `expects_photo` boolean default false · `source` enum(`ai_generated`,`template`,`manual`,`edited`) NN (whole-set marker — L-7.3) · `source_draft_id` → job_scope_drafts (**set null** — a published step outlives its draft) · `status` (operational soft-delete enum) · timestamps. Index `jss_tenant_job_order_idx(tenant_id, job_id, step_order)` (non-unique — soft-deleted rows may retain orders).

## FK delete rules
- **CASCADE:** every `tenant_id` → tenants; `*.job_id` → jobs; the `agent_run_id` chain (`jsd_` → agent_runs); `jsr_draft_id` → job_scope_drafts; `sts_template_id` → scope_templates; `agent_policies.client_id` → clients.
- **SET NULL:** `job_scope_reviews.reviewer_user_id` → users; `job_scope_steps.source_draft_id` → job_scope_drafts; `scope_templates.trade_id` → trades.
- Defaults tables (`*_defaults`) have **no FKs**.

## JSON-as-longtext on MariaDB — read-parse boundary (R-6.19)
New `json()` columns (physically `longtext` + a `CHECK(json_valid(...))`): `agent_policies.policy`, `agent_policy_defaults.policy`, `job_scope_drafts.proposed_steps`, `job_scope_reviews.edited_steps`. mysql2 returns them as **strings**; every data-layer read parses at the boundary (`resolveAgentPolicy` parses `policy`; `drafts.ts` parses `proposed_steps`; `reviews.ts` parses `edited_steps`). Writes are fine. The `ai_prompt_templates` text fields are plain `text` (no JSON).

## Seed / keeper data
- **`db/seeds/agent-config.ts`** (`pnpm db:seed:agent-config`) — idempotent `tsx` seed, **platform defaults only**. Seeds `ai_prompt_template_defaults` + `agent_policy_defaults` rows for **`scope_generator_v1`** (7c step 1) and **`update_rewriter_v1`** (7c step 3 — its system prompt **relocated verbatim** from the former `prompt.ts` constant; byte-equality verified). Both: `version=1`, `status='active'`, `model_hint='anthropic/claude-sonnet-4-6'`, `temperature='0.30'`, policy `{requiresReview:true}`. No tenant-specific rows (the resolver falls through to these).
- **Keeper runs (real Sonnet 4.6, persisted):** **Job #1** — a 9-step scope, **no-edit** publish: 1 `agent_run` (succeeded, model `anthropic/claude-sonnet-4-6`, prompt_version `1`) + 2 `agent_tool_calls` (getJobDetail/createScopeDraft) + 1 `agent_decision` (`scope_proposal`, queued_for_review) + 1 `job_scope_draft` (published) + 1 `job_scope_review` (approve) + **9 `job_scope_steps` (`source='ai_generated'`)** + job columns (`generated_ == approved_`). **Job #2** — a 14-step draft **edited** down to **8 published steps (`source='edited'`)**, the L-7.4 two-column-divergence artifact (`generated_` ≠ `approved_`).
- The rewriter retrofit means **new** `update_rewriter_v1` runs record `prompt_version='1'` (was `"v1"` — D-7.4). The Phase 6 Job #2 rewriter chain remains the documented rewriter reference.

## Verification
```bash
mysql ... -e "SELECT COUNT(*) FROM __drizzle_migrations;"   # 16
# 0015 json columns are longtext + json_valid CHECK:
mysql ... -e "SHOW CREATE TABLE job_scope_drafts\G" | grep proposed_steps
# the two seeded default agents:
mysql ... -e "SELECT agent_id, version, status FROM ai_prompt_template_defaults ORDER BY agent_id;"
# scope_generator_v1 / 1 / active   ·   update_rewriter_v1 / 1 / active
```

## Forward pointers
- **`scope_templates`/`scope_template_steps`** activate when template seeding + grounding ship (post-Phase-7, evaluated empirically — Q from Surface #4).
- **`agent_policies`** gain real per-tenant/per-client rows + auto-execute thresholds in Phase 8+ (the disposition enum already carries `auto_executed`/`policy_blocked`; Phase 7 emits only `queued_for_review` — L-7.1).
- **Phase 9** analytics may add indexes (e.g. `agent_runs` by model/cost) and should normalize the `prompt_version` `"v1"`/`"1"` boundary (D-7.4) when grouping rewriter runs.
- **A re-scope workflow** would need replace-semantics in `publishScopeDraft` (today it appends; the gate L-7.7 makes that safe by allowing publish only once).
