# Phase 24 — Business Rules

The §2 invariants this phase touched, and the new provider/failover/retention/observability
rules. The harness (`check-phase-24.ts`, 28/0) is the executable form of these.

## v2 invariants touched

| Invariant | How Phase 24 honors it |
|---|---|
| **§2.1 Autonomy fail-safe-gated** | Unchanged and untouched — the resolver still fail-safes to gated. Observability is read-only; multi-provider preference fail-safes to today's env-driven base on absent/bad/unavailable input. |
| **§2.2 Never silent** | Observability does not bypass the audit/provenance chain — it **reads** `agent_runs`/`agent_decisions`/reviews; it writes nothing. The retention job preserves every summary/decision row (NULL-not-delete), so the legibility record survives. |
| **§2.3 Permission ≠ readiness** | The defining invariant of this phase. The `/agents` observability surface **is** the readiness evidence; the live autonomy trigger stays unwired (CF-24.2) until that evidence justifies enabling it. Building the evidence ≠ flipping the switch. |
| **§2.4 Non-overridable guardrails not bypassed** | The observability readers only **read** the guardrail-relevant data (tokens, dispositions, committed $) — they never relax a ceiling or the kill switch. Cost is reported, not enforced. |

## New rules — multi-provider / failover

- **Failover retries TRANSPORT errors only.** Retry the next provider on `APICallError` with
  `isRetryable === true` or `statusCode ∈ {408,409,429,500,502,503,504}`. **Rethrow immediately**
  (no failover) on a legitimate agent error (`NoObjectGeneratedError` / `TypeValidationError` /
  validation / refusal) or any non-API error.
- **`recordedModel` = the model that actually ran** — set per successful candidate, so cost and
  volume attribution stay truthful under failover.
- **Preference = allowlist + order, not a floor.** Only listed-and-available providers are tried,
  in order; never auto-append. Empty/absent/all-unavailable → today's env-driven base (fail-safe;
  never a hard error).
- **Provider availability is key presence** — a provider with no env key is *unavailable*
  (skipped), never an error. OpenAI dormant with no `OPENAI_API_KEY`.

## New rules — cost (observability)

- **Cost is compute-on-read** (`tokens × model price`), grouped by **(agentId, model)** — an agent
  on two models has two price regimes; never sum tokens across models then price once.
- **Null-model and unknown-model rows are EXCLUDED from cost** — unmeasurable, **not $0** (the cost
  analogue of the two-NULLs rule). Rule-based agents (no model) and unpriced models contribute no
  cost row, never a false zero.

## New rules — approve-as-is (observability)

- **Latest review per draft wins** — a re-reviewed draft counts once (newest review classifies it);
  raw review rows are never double-counted.
- **Approve-as-is = `decision='approve' AND <edit column> IS NULL`** (rewriter `edited_content`,
  scope `edited_steps`). An agent with **no review surface** (`dispatch_router_v1`) reports **"N/A",
  never 0%** — a 0% would misrepresent a rule-based agent as untrusted.

## New rules — retention

- **180-day, NULL-not-delete, global-by-age, idempotent.** Clear only the three heavy longtext
  payloads to NULL; never delete rows (CASCADE-FK safety). The age threshold is DB-side
  (`NOW() - INTERVAL 180 DAY`), never a JS Date. `AND payload IS NOT NULL` makes re-runs no-ops.
- **Summary is permanent** — model, tokens, status, disposition, timestamps, and all aggregate/cost
  history survive retention. Only the heavy bodies of aged rows go NULL (two non-protected surfaces,
  `getRunTrace` debug bodies + review-queue `decisionMetadata` rationale, age out — the intended
  effect, documented in the retention script header).
