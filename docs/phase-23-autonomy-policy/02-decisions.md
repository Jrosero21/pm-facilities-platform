# Phase 23 — Decisions

The locked decisions and their rationale. Each was validated against live code + the sandbox
harness before this closeout.

## (a) Autonomy fields live in the policy JSON, not new columns

`autonomyEnabled` is a key inside the `agent_policies` / `agent_policy_defaults` `policy` JSON,
read at the parse boundary (`toResolved`), **not** a typed column. Rationale: **fail-safe by
construction (§2.1).** The resolver computes `autonomyEnabled = parsed?.autonomyEnabled === true`
— explicit-`true` required, mirroring the `requiresReview !== false` discipline. A malformed,
missing, or unparseable policy yields `autonomyEnabled: false` (gated). Adding a column would
need a NOT-NULL default and a migration; the JSON key needs neither and cannot accidentally
default to "on."

## (b) Kill switch as resolver step 0 — a simple extra query, not tx-widening

The kill switch is the first read in `resolveAgentPolicy`, before the per-client step. It is one
extra single-row lookup on `tenant_autonomy_settings` per resolve. Rationale: the resolver is a
Phase-7 function with two callers doing pure policy resolution; **folding the read in as step 0
keeps the contract (never throws, fails safe) intact** without widening the signature to thread a
`tx` handle through. The extra query is uncached, accepted by design. A missing settings row =
"no kill switch set" → fall through to the normal ladder (a missing row never enables anything).

## (c) One guardrail table — `tenant_autonomy_settings`

A single tenant-singular table (UNIQUE `tenant_id`) holds the kill switch + all five ceilings
(committed-$ per job/day/tenant, LLM tokens per day/tenant). Rationale: the §2.4 non-overridable
layer is one concept with one owner (the tenant); splitting caps across tables would scatter the
"what may autonomy do here" answer. The UNIQUE is sound here (no nullable key, unlike
`agent_policies`).

## (d) Provenance = Option A (synthetic `agent_runs` row)

To record an autonomous dispatch decision, `autoDispatchDraftForJob` opens a synthetic
`agent_runs` row (`triggerSource:"auto_dispatch"`, token cols NULL) and calls `logDecision`.
Rationale: the `disposition` enum (`auto_executed` / `policy_blocked`) **lives only in
`agent_decisions`**, whose `agent_run_id` is **NOT NULL** with no direct `agent_id` column — so a
decision row **cannot exist without a run**. The alternative (audit-only) could not emit those
enum values. The Phase-22 `auto_drafted` audit event **stays** (additive — the draft's legibility
record is unchanged). NULL token columns mean the synthetic run never pollutes the token meter.

## (e) The two-NULLs rule — opposite safe directions

- **NULL *cap*** (`max_*` unset) = the tenant set no limit → **skip that axis (within/permissive)**.
- **NULL *committed amount*** (`getEffectiveNte` returns null = job has no base NTE) =
  **UNMEASURABLE → block** (`candidateUnmeasurable: true`, `ok: false`).

Rationale: absence of a *limit* is permissive; absence of a *measurement* is restrictive. A null
NTE must never silently drop from the sum (it is surfaced as `unmeasurableCount`) and must never
let an unbounded commit through. Different nulls, deliberately opposite.

## (f) Cumulative-spend breaker (WORK_COMPLETE counts)

The dollar meter's committed set excludes **only** the withdrawn terminal statuses
**DECLINED + CANCELLED**. **WORK_COMPLETE counts** — a completed autonomous commit is real
committed spend. Rationale: excluding completed work would **under-count**, the unsafe direction
for a spend breaker. (This replaced an earlier `is_terminal = false` filter that wrongly dropped
WORK_COMPLETE — corrected in the 23f-2 carry-fix.)

## (g) `>= cap` blocks

"Within" = projected value **strictly less than** the cap; reaching or exceeding the cap blocks.
Applied uniformly to per-job / per-day / per-tenant dollar caps and to both token ceilings.

## (h) Thrown send = `queued_for_review` + run `status: failed`

If a permitted auto-advance calls `sendDispatch` and it **throws** (a real execution failure, not
a gate), the decision row is `disposition: "queued_for_review"` paired with `closeRun(status:
"failed", errorMessage)`, and the outcome is `drafted_send_failed`. Rationale: the enum has only
three values; `policy_blocked` would falsely imply policy stopped it (policy *permitted* it),
`auto_executed` would falsely claim success. After a failed send the draft physically **awaits a
human** — exactly `queued_for_review`'s meaning. The `run.status = failed` + `errorMessage`
distinguishes it from a *normal* gated `queued_for_review` (which closes `succeeded`).

## (i) Token meter = ALL tenant LLM usage

The token ceiling sums **every** `agent_runs` row for the tenant regardless of `trigger_source`,
not just autonomous runs. Rationale: the dispatch agent is rule-based and writes no LLM tokens, so
"autonomy-only" tokens would be an empty set today; the intended guardrail is total tenant LLM
spend. `agent_runs.tenant_id` is on the row directly (no join); NULL token columns are COALESCEd
to 0.

## (j) Tenant-supplied LLM API keys deferred (CF-23.1)

Self-service tenant API-key storage + AI usage restrictions are **deferred** — they depend on
Phase-24 multi-provider wiring and **credential encryption-at-rest (CF-12.4 in the live bank)**.
`tenant_autonomy_settings` is the natural home for the *limits*; key *storage* is a new security
surface. (Note: the 23h handoff referenced "CF-12.1 encryption," but the live carry-forward bank's
encryption item is **CF-12.4**, "Credential encryption-at-rest" — CF-12.1 is "Full-workflow
auto-push." The live bank wins; see `closeout-carryforwards.md`.)

## Phase-22 vocabulary lineage (recorded for the §6/§9 watchpoint)

The 23f-2 batch edited `scripts/check-phase-22.ts`, changing three assertions from the bare
`"drafted"` outcome to **`"drafted_pending"`**, because the governed `AutoDispatchResult` removed
the bare `"drafted"` variant (every successful draft now runs the gate). **A Phase-22 ledger
assertion now depends on a Phase-23 vocabulary change.** The DRAFT-GATE invariant Phase 22 proved
(lands at DRAFT, never SENT for a default tenant) still holds — only the label changed. This
lineage is recorded here so the dependency is explicit and not mistaken for a regression.
