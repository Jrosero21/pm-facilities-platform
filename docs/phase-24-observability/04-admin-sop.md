# Phase 24 — Admin SOP

Tenant/admin procedures for the Phase-24 surfaces. As of Phase 24 these are data operations
+ scripts (no admin UI for provider preference this phase).

## ⚠️ Provider keys use the PLATFORM's env keys (CF-23.1 boundary)

Provider selection uses the **platform's** keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` in env
config) — **not** tenant-supplied keys. Tenant-supplied key storage + a self-service Settings
UI are deferred behind **CF-12.4** (credential encryption-at-rest). Do not attempt to store a
tenant key; there is no encrypted home for it yet.

## Setting a provider failover preference (per-tenant / per-client / default)

Preference lives in the agent's resolved **`agent_policies` JSON** as `failoverOrder` — an
ordered array of **provider-qualified model strings**:

```json
{ "requiresReview": true, "failoverOrder": ["anthropic/claude-sonnet-4-6", "openai/gpt-5.4"] }
```

Resolution uses the existing ladder: a **per-client** `agent_policies` row overrides a
**per-tenant** row overrides the **platform default** (`agent_policy_defaults`). Set the
preference on whichever row matches the scope you want. Semantics:
- **Allowlist + order:** only the providers you list (and that have a key) are tried, in that
  order. Unlisted-but-available providers are **not** auto-appended.
- **No key / unavailable provider → gracefully skipped** (never an error). If `openai/...` is
  listed but `OPENAI_API_KEY` is unset, it's skipped.
- **Empty / malformed / all-unavailable preference → falls back to today's env-driven base**
  (Anthropic) — a bad preference never hard-fails the agent.
- **No `failoverOrder` at all → unchanged behavior** (single env-driven provider).

Failover only retries on **provider/transport** errors (timeouts, 429, 5xx); a legitimate
agent error (bad output/refusal) does **not** fail over. The recorded model reflects the
provider that actually ran (so cost/volume stay truthful).

## Running the retention job (180-day payload cleanup)

The script clears aged heavy JSON payloads (`agent_tool_calls.tool_input`/`tool_output`,
`agent_decisions.metadata`) to NULL — never deletes rows; all summary/cost/disposition history
is preserved. It runs against the **configured DATABASE_URL** (prod-capable — it does NOT force
sandbox).

```
# 1. DRY RUN FIRST (default) — reports eligible counts, writes NOTHING:
pnpm db:retention:agent-payloads
#    Confirm the printed "target DB:" line is the DB you intend.
# 2. APPLY — only when you mean it:
pnpm db:retention:agent-payloads -- --apply
```

The dry-run is the safety: it prints the target DB and the eligible counts. At present it
reports **0 eligible** (all rows are recent; nothing is 180 days old yet) — a forward-looking
no-op. Re-running is idempotent (already-cleared rows are skipped).

## Running the phase-blocking harness

```
pnpm db:check:observability
```

Forces the `*_sandbox` DB, self-seeds a fresh `phase24-harness-tenant`, asserts the
observability readers + failover logic + retention counter (28 checks), and tears its fixtures
down by tracked id. Expect **`PHASE-24 OBSERVABILITY LEDGER GREEN ✓`, 28/0**. (Requires the DB
tunnel up.)
