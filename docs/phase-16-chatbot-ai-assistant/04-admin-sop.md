# Phase 16 — Admin SOP

## Running the phase-blocking harness

```
pnpm run db:check:chatbot-assistant
```

- **Sandbox-only:** the harness swaps `DATABASE_URL` to `…/jonnyrosero_pm_sandbox` at module
  top and **hard-exits (code 2)** if the resolved URL is not a `_sandbox` DB. It never touches
  prod.
- **Destructive + self-seeding:** it resolves the phase-9 seed (tenant `phase9-seed-tenant`,
  Acme, `operator@phase9seed.test`), builds a throwaway tenant-B (tenant+client+location+job+
  vendor) for the cross-tenant poison, and tears **everything** down in a `finally` — including
  all `chatbot_assistant_v1` run artifacts (drafts / tool_calls / decisions / runs). It is
  idempotent: green on repeated clean runs.
- **37 assertions across groups A–F** (knowledge+guard / job-summary / draft-gate / agent_*
  logging / cross-tenant poison / write-boundary). Exit 0 = green; nonzero = phase blocked.
- Run with the `--conditions=react-server` flag (already in the alias) for the server-only imports.

## Adding a knowledge document

`searchKnowledge` discovers the corpus at call time by globbing `07-chatbot-knowledge.md` under
`docs/`. To add knowledge: **drop a `07-chatbot-knowledge.md` into a `docs/<area>/` directory** —
no code change, no redeploy of the tool. `readDoc` can fetch any `.md` under `docs/` (and only
under `docs/`; the `resolveDocPath` guard rejects traversal, absolute paths, and non-`.md`).

## AI-provider wiring (reused from Phase 7)

The assistant reuses the shared provider seam (`src/server/agents/llm-routing.ts`). Precedence:
`CHATBOT_MOCK=1`/`AGENT_MOCK=1` → mock · `AI_GATEWAY_API_KEY` → Vercel AI Gateway
(`provider/model`) · `ANTHROPIC_API_KEY` → direct `@ai-sdk/anthropic` · else mock. Per-agent
overrides: `CHATBOT_MODEL` / `CHATBOT_MOCK`. **Note:** Phase 16's draft text is currently
deterministic (no LLM call); the routing seam is wired for when LLM phrasing lands (B-16.5).
System prompts resolve from `ai_prompt_templates` (fail-closed) when the LLM path is used.

## DB access reminder (WP-12.1)

Read-only CLI via `~/.pm_db.cnf` (`--defaults-extra-file`), **naming the DB explicitly**
(`jonnyrosero_pm` for prod, `jonnyrosero_pm_sandbox` for the harness). `\G` fails under
`-e`/stdin — use `-E` vertical + `information_schema`. Phase 16 added **no migration**; next free
is 0042.

## What admins cannot do through the assistant

The assistant cannot publish, send, mutate operational state, or cross tenants — by construction
(no publish import; tenant captured in the tool closure). There is no admin override that grants
it those; those actions remain human-gated.
