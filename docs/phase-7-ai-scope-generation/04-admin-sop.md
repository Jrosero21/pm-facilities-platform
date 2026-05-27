# Phase 7 — Admin / Internal SOP

Developer/administrator procedures introduced in Phase 7. Builds on Phase 1–6 SOPs (env setup, the migration pipeline, FK-rule verification, the ephemeral-script + mutate-restore discipline, the mock-vs-real LLM workflow).

> **Prerequisites for every `mysql`/`db:*` command below:** the SSH tunnel open + `MYSQL_PWD`/`DATABASE_URL` set (Phase 1 SOP-1.A). `mysql ...` = `mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm`.
> **Connection-cap gotcha (learned this phase):** the shared host's `max_user_connections` is **low**. **Stop `next dev` before any `db:migrate` or DB-touching verify script** — the dev server's mysql2 pool otherwise saturates the cap and the command fails `ER_TOO_MANY_USER_CONNECTIONS`. Restart dev after.

## SOP-7.A — Apply the Phase 7 migrations (0013, 0014, 0015)
```bash
pnpm db:generate   # drizzle-kit generate → fix-mysql-engine → check-migration-identifiers
pnpm db:migrate    # apply pending migrations (dev server DOWN — see the cap gotcha)
```
- **`0013_dark_nemesis`** — agent-config substrate: `ai_prompt_templates` + `ai_prompt_template_defaults` + `agent_policies` + `agent_policy_defaults`.
- **`0014_yummy_wong`** — scope template forward-decls (schema-only): `scope_templates` + `scope_template_steps`.
- **`0015_salty_katie_power`** — scope I/O: `job_scope_drafts` + `job_scope_reviews` + `job_scope_steps`.
- Total recorded migrations after Phase 7: **16** (`0000`–`0015`); **0 `jobs` column changes** (the scope columns predate this phase — D-4.6). New FK prefixes (≤ 64 chars): `apt_`/`aptd_`/`ap_`/`apd_` (0013), `st_`/`sts_` (0014), `jsd_`/`jsr_`/`jss_` (0015). Always inspect generated SQL before `db:migrate`; the three migrations were verified to apply byte-identically from-scratch.

## SOP-7.B — Seed the agent config (prompts + policies)
```bash
pnpm db:seed:agent-config   # idempotent; tsx --env-file=.env.local
```
- Seeds **platform defaults only**: one `ai_prompt_template_defaults` + one `agent_policy_defaults` row each for **`scope_generator_v1`** and **`update_rewriter_v1`** (`version=1`, `status='active'`, `model_hint='anthropic/claude-sonnet-4-6'`, `temperature='0.30'`, policy `{requiresReview:true}`). Idempotent — re-running skips rows already present (F1 unique keys).
- **No tenant-specific rows** are seeded — the runtime resolver falls through tenant → defaults (OQ #3), so a default serves every tenant. A tenant override is added only when a tenant needs different wording/policy.
- The rewriter's system prompt lives **here** (relocated from the former `prompt.ts` constant). To change a prompt's wording, edit the seed's source-of-record constant and re-seed (or, for an existing tenant, add a versioned tenant row — SOP-7.C).

## SOP-7.C — The single-active discipline (activating a new prompt/policy version)
- **Invariant (R-7.1):** at most one row per resolver key (`tenant_id, agent_id, variant` for prompts; `tenant_id, client_id, agent_id` for policies) may be `status='active'`. There is **no DB unique** enforcing this on `agent_policies` — it's a **write-path invariant**, enforced by the data-layer `activatePromptTemplate` / `activateAgentPolicy` (demote the current active in a txn, assert ≤ 1 demoted, promote the target, assert exactly 1).
- **Do not** flip `status='active'` with a raw `UPDATE` — that bypasses the demote and can leave two actives, which the read resolver only papers over with `ORDER BY version DESC LIMIT 1`. Always go through the activate functions. (No admin UI for activation yet — it's data-layer-only in Phase 7; a future admin surface uses the same functions.)
- Concurrent activations serialize (last-writer-wins, exactly one active); Phase 7 is not built for high-concurrency activation (Dec-3b).

## SOP-7.D — Scope-generator dev workflow (mock vs real LLM)
```bash
# token-free dev / probes — deterministic stub, no key needed:
SCOPE_GEN_MOCK=1 NODE_OPTIONS="--conditions=react-server" pnpm exec tsx --env-file=.env.local scripts/<probe>.ts
# mock ALL agents at once:
AGENT_MOCK=1 ...
```
- **`SCOPE_GEN_MOCK=1`** (or **`AGENT_MOCK=1`**, or **no key**) routes `generateScope` to a deterministic stub. The **real** call needs a key in `.env.local`: gateway `AI_GATEWAY_API_KEY` (model `"anthropic/claude-sonnet-4-6"`) or direct `ANTHROPIC_API_KEY` (`"claude-sonnet-4-6"`); override with `SCOPE_GEN_MODEL`.
- `resolveAgentRouting` precedence: agent mock var **or** `AGENT_MOCK` > `AI_GATEWAY_API_KEY` > `ANTHROPIC_API_KEY` > mock. The rewriter uses `REWRITER_MOCK`/`REWRITER_MODEL` on the same shared router (its behavior is byte-identical to pre-extraction **only when `AGENT_MOCK` is unset** — D-7.1).
- In **mock**, the agent skips prompt resolution and records `prompt_version='mock'`; in **real** mode a missing active prompt **fails the run** (`NoActivePromptError` — R-7.3), so seed (SOP-7.B) before real runs.

## SOP-7.E — Inspect the keeper scope chains
```bash
mysql ... -e "SELECT agent_id, status, model, prompt_version, input_tokens, output_tokens
  FROM agent_runs WHERE agent_id='scope_generator_v1' ORDER BY created_at;"
# Job #1 + Job #2 runs: succeeded / anthropic/claude-sonnet-4-6 / 1 / <tokens>
mysql ... -e "SELECT j.job_number, jss.source, COUNT(*) FROM job_scope_steps jss
  JOIN jobs j ON j.id=jss.job_id WHERE jss.status='active' GROUP BY j.job_number, jss.source;"
# expect: #1 / ai_generated / 9   ·   #2 / edited / 8
mysql ... -e "SELECT j.job_number, (j.generated_scope_of_work = j.approved_scope_of_work) AS columns_equal
  FROM jobs j WHERE j.scope_generation_status='approved';"
# expect: #1 / 1 (no-edit)   ·   #2 / 0 (edited — the two-column divergence)
```

## SOP-7.F — Verify the rewriter retrofit (post-migration provenance)
```bash
mysql ... -e "SELECT prompt_version, COUNT(*) FROM agent_runs WHERE agent_id='update_rewriter_v1' GROUP BY prompt_version;"
# pre-retrofit runs: 'v1'  ·  post-retrofit runs: '1'  (the D-7.4 provenance boundary — accommodate both when filtering)
```
- The `"v1"`→`"1"` boundary is expected (D-7.4): old rewriter runs used the code constant; new ones resolve the DB version. The Phase 6 Job #2 rewriter chain remains the documented rewriter reference.

## SOP-7.G — Light up a deferred Phase 7 surface later
Each deferral's *what + why* lives in its `L-7.x` entry (`10-known-limitations.md`); this is the *how* once the deferral lifts:
- **Scope templates** (L-7.* / OQ #2): seed `scope_templates`/`scope_template_steps`, then wire an "apply template" path + optional few-shot grounding into `runScopeGenerator`.
- **Per-client / auto-execute policy** (L-7.1): seed real `agent_policies` rows, then implement the auto-execute branch in `runScopeGenerator`'s disposition mapping (the `auto_executed`/`policy_blocked` dispositions already exist on `agent_decisions`).
- **Re-scope** (L-7.7): add replace-semantics to `publishScopeDraft` + a path to retire the existing scope.
- **Admin activation UI**: build a surface over `activatePromptTemplate`/`activateAgentPolicy` (data-layer-only today — SOP-7.C).
- **Per-agent seed files** (Q-7.1): split `db/seeds/agent-config.ts`.
