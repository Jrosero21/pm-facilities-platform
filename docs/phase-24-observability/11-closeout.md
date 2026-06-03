# Phase 24 Closeout — Observability + Multi-Provider/Failover + Retention

## Phase Goal

Build the **§2.3 readiness-evidence layer** for autonomy: agent observability (track A),
multi-provider + failover (track B), and 180-day token-logging retention (track C). Phase 23
shipped the autonomy engine but left the live trigger unwired ("permission ≠ readiness");
Phase 24 builds the surface to *see* agent behavior, hardens the LLM path against a provider
outage, and ages out heavy logging — **read + code only, no schema, 0047 untouched**.

## Completed Deliverables
- **Observability data layer** — 7 compute-on-read readers (`agent-observability.ts`):
  volume, dispositions, dispatch-autonomy, approve-as-is (+ per-agent adapters, latest-review
  dedupe, dispatch N/A), failure points, cost (model→price map), latency.
- **AI Agents page** — dedicated read-only `/agents` route, ops-gated, numeric cards + tables.
- **Retention** — 180-day NULL-not-delete cleanup script (dry-run default; `--apply`),
  shared eligibility counter (`retention.ts`).
- **Multi-provider + failover** — provider registry (Anthropic + dormant OpenAI), failover
  loop (transport-only retry, truthful `recordedModel`), preference from `agent_policies` JSON.
- **Harness** — `check-phase-24.ts` (`db:check:observability`), 28 assertions.

## Files Created or Changed (7-commit stack)
- `72662c5` — observability readers + `config/pricing.ts`.
- `e093464` — `/agents` page + nav.
- `78b14d7` — retention script.
- `67ca11e` — provider registry + OpenAI direct path (dormant) + `@ai-sdk/openai`.
- `435441f` — CF-24.1 fix (module-isolate harness scripts; see carryforwards for the corrected story).
- `c66b82a` — failover loop + provider-preference reading.
- `d9d49bc` — `check-phase-24.ts` harness + `countEligibleAgentPayloads()` extraction.

## Database Changes
**None.** No tables, no columns, no migration. Latest migration stays **0046**; **0047
untouched/nonexistent**. Preference reuses `agent_policies` JSON; cost reuses
`agent_runs.model`+tokens; observability reads only; retention `UPDATE`s payloads to NULL
(never deletes). See `08-db-changes.md`.

## API Routes / Server Actions Added
One read-only server-component page (`/agents`, ops-gated at the page layer). No new mutating
routes/actions. Retention runs via a CLI script; failover runs inside the existing agent call
path. See `09-api-routes.md`.

## User-Facing Workflows Added
The `/agents` observability page — reading agent behavior as readiness evidence (approve-as-is,
volume, dispositions, autonomy panel, cost, failures, latency); dispatch shows **N/A** for
approve-as-is, never 0%. See `03-user-sop.md`.

## Admin/Internal Workflows Added
Set a provider `failoverOrder` in `agent_policies` JSON (per-client/tenant/default); run the
retention job (dry-run → `--apply`, confirm target DB); run `db:check:observability`. See
`04-admin-sop.md`.

## Business Rules Added
Failover retries transport errors only (truthful recordedModel; allowlist+order preference;
fail-safe base); cost compute-on-read grouped by (agent,model) with null/unknown-model
exclusion; approve-as-is latest-review dedupe + dispatch N/A; 180-day NULL-not-delete retention.
§2.3 (permission ≠ readiness) is the phase's defining invariant. See `06-business-rules.md`.

## Chatbot Knowledge Added
Reader signatures + returns, the `/agents` route + gate, the provider registry + `failoverOrder`
JSON shape, retention 180d/NULL-not-delete, the harness name + what it proves. See
`07-chatbot-knowledge.md`.

## Verification Performed

```bash
pnpm db:check:observability   # check-phase-24.ts — 28 passed / 0 failed, LEDGER GREEN, exit 0 (fresh read)
# re-run immediately            → 28/0 GREEN (idempotent: pre-clean + reseed + teardown clean)
# sandbox after runs            → 0 leftover phase24-harness-tenant rows (teardown complete)
pnpm db:retention:agent-payloads  # DRY RUN, target jonnyrosero_pm, 0 eligible, no writes (behavior-preserved post-extraction)
npx tsc --noEmit              # 0 errors repo-wide
pnpm lint                     # clean on changed files
pnpm build                    # green (23/23 pages)
```

## Known Limitations
OpenAI built-but-dormant (failover proven by logic, not live traffic); live trigger unwired
(CF-24.2); thin prod observability data; cost-map prices third-party-sourced (confirm at
key-add); CF-23.2 (O(N) dollar meter) still banked. See `10-known-limitations.md`.

## Carry-Forward Items
The entire Phase-23 bank rolls forward verbatim (Phase 24 retires nothing). **CF-24.1 RESOLVED**
this phase (the global-`main()` collision the retention script introduced; fixed at `435441f` —
corrected story in the carryforwards). **CF-24.2 NEW/OPEN**: live autonomy trigger deferred
pending proven observability (§2.3). CF-23.1's multi-provider-wiring dependency is now satisfied
(the feature still awaits CF-12.4 key storage + a Settings UI). See `closeout-carryforwards.md`.

## Recommended Next Phase Focus
**Phase 25 — feedback loop.** Consume these observability readers (approve-as-is, failure
patterns, cost) as the data that informs autonomy tuning — and, on sustained evidence, the
deliberate CF-24.2 decision to wire the live trigger for a proven agent on a proven tenant.
