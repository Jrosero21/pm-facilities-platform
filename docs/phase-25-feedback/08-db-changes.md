# Phase 25 — Database Changes

## NONE.

Phase 25 added **no schema and no migration**. The highest migration on disk remains `0046`;
**`0047` stays free**. The feedback loop is **compute-on-read** over the existing draft/review tables.

## Tables READ (no writes by this phase)

| Table | Columns used | Role |
|---|---|---|
| `agent_runs` | `id`, `agent_id`, `tenant_id` | join + agent-identity filter in the harvest chain |
| `update_rewrite_drafts` | `id`, `agent_run_id`, `tenant_id`, `draft_content` (text) | rewriter draft side of the pair |
| `update_rewrite_reviews` | `draft_id`, `decision` (enum), `edited_content` (text, nullable), `created_at` | rewriter review / edit side |
| `job_scope_drafts` | `id`, `agent_run_id`, `tenant_id`, `proposed_steps` (JSON longtext) | scope draft side of the pair |
| `job_scope_reviews` | `draft_id`, `decision` (enum), `edited_steps` (JSON longtext, nullable), `created_at` | scope review / edit side |

The reader joins `agent_runs → <agent>_drafts → <agent>_reviews`, dedupes to the latest review per
draft by `created_at`, and returns the raw content pair. JSON columns are read via `CAST(... AS CHAR)`
so the raw stored string is returned (drizzle's `json()` decoder is bypassed) — no parsing in the
reader.

## Deferred schema question (NOT done — banked)

- **Few-shot provenance on `agent_runs`.** Today `agent_runs.prompt_version` records which prompt
  template ran, but **not which correction examples** were injected into that run. Recording the
  injected-pair set (or a hash/count) would make provenance fully truthful about what the model saw.
  This is an observability concern, deferred from the 25a schema-need assessment and **banked as
  CF-25.1** — not built here, so `0047` is left free for the phase that decides it.
