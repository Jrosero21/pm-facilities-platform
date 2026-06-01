# Phase 16 — DB Changes

## ZERO new tables. ZERO migrations.

Phase 16 added no schema. Empirically confirmed:
- Live table count: **115** (unchanged from Phase 15; includes `__drizzle_migrations`).
- Latest migration: **0041** (`0041_charming_william_stryker.sql`, Phase 15). Next free is **0042**, untouched.

The phase is built **entirely on reused substrate**, satisfying WP-16.1 (target zero new tables).

## Reused substrate

| Concern | Tables (reused) | Origin |
|---------|-----------------|--------|
| AI run + tool-call + decision logging | `agent_runs`, `agent_tool_calls`, `agent_decisions` | Phase 6 (6g.a) |
| Agent policy (disposition) | `agent_policies`, `agent_policy_defaults` | Phase 7 |
| Drafts + §2.5 review gate | `update_rewrite_drafts`, `update_rewrite_reviews` | Phase 6 (6g.a) |
| AI provider / system prompts | `ai_prompt_templates`, `ai_prompt_template_defaults` | Phase 7 |
| Publish targets (human-gated, not agent-reachable) | `client_update_logs`, `communication_logs` | Phase 6 |

The assistant **writes** only `update_rewrite_drafts` (at `pending_review`) and the `agent_*`
logging rows. It never writes `client_update_logs` / `communication_logs` / `update_rewrite_reviews`
/ any operational table — verified by harness groups C and F.

## Roadmap §9 empirical correction (record this)

Roadmap §9 ("AI Scope / AI Logging") named tables that **do not exist** and were **superseded by
the live design** — recorded here so §9 does not mislead future work:

- **`ai_action_logs`** — never built. AI actions log via the **`agent_*`** substrate
  (`agent_runs` / `agent_tool_calls` / `agent_decisions`), introduced Phase 6, inherited by
  Phases 7/8/13/16. Decision F16-B.
- **`ai_generated_updates`** — never built. AI-generated drafts land in **`update_rewrite_drafts`**
  (Phase 6), the §2.5 review-gated draft table. Decision F16-C.
- **`ai_scope_generation_logs`** — never built. Phase-7 scope generation logs to the same
  `agent_*` substrate (+ `job_scope_drafts`).

The only live `ai_*` tables are `ai_prompt_templates` and `ai_prompt_template_defaults` (the
prompt-config layer). See `16h-roadmap-completion.md` for the full inventory.
