# Phase 23 — Business Rules

The v2 autonomy invariants (§2.1–2.7) and the Phase-23-specific rules, **each mapped to its
standing assertion in `scripts/check-phase-23.ts`** (the phase-blocking harness, 30/0 green). The
harness is the executable form of these rules.

## v2 invariants → harness assertions

| Invariant | Rule | Harness group |
|---|---|---|
| **§2.1 Fail-safe-off default** | Absent an explicit opt-in, autonomy is OFF — gated. An explicit tenant policy without `autonomyEnabled`, AND a tenant with no policy at all (platform default), both stay gated. | **Group 1** (explicit tenant policy → `drafted_pending`/`not_enabled`, source `tenant`); **Group 10** (no policy row → source `default`, gated). |
| **§2.2 Autonomy never silent** | Every autonomous action — fired or blocked — leaves a provenance row. | Every group: a synthetic `agent_runs` + `agent_decisions` row (`auto_executed` / `policy_blocked`), plus the kept `auto_drafted` audit. Asserted in groups 1c, 2c, 3c, 10b. |
| **§2.3 Permission ≠ readiness** | Enabling autonomy is permission, not proof of readiness; no live trigger and no dashboard until Phase 24. | Encoded as the **no-live-trigger** state (`autoDispatchDraftForJob` invoked only by the harness) + the §2.3 warning in `04-admin-sop.md`. The audit/provenance rows are the readiness substrate the Phase-24 dashboard will read. |
| **§2.4 Non-overridable guardrails** | The kill switch and the ceilings override an otherwise-enabled tenant; no policy can exceed them. | **Group 3** (kill switch reverts an enabled tenant → gated, source `kill_switch`); **Group 4a** (spend cap < NTE blocks); **Group 4b** (token cap < usage blocks). |
| **§2.5 Eligibility floor** | Autonomy never sees an ineligible vendor — the gate operates only over the Phase-22 floor-filtered (trade/geo/compliance/not-blocklisted) candidate set. | **Group 7** (picked vendor == matcher floor top candidate). |
| **§2.6 Idempotency** | An autonomous action cannot double-fire. | **Group 6** (2nd call → `already_active`, one assignment; double `sendDispatch` → 2nd throws `ASSIGNMENT_NOT_DRAFT`). |
| **§2.7 Manage-by-exception** | The default is "prepare the obvious choice, defer to the operator" — a gated draft is the normal path, not an error. | The `drafted_pending` outcome itself (groups 1, 3, 4a, 4b, 5, 10): the DRAFT is always created and retained for review when not permitted. |

## Phase-23-specific rules

| Rule | Statement | Harness group |
|---|---|---|
| **Enabled + within → fire** | `permitted = autonomyEnabled && token.ok && spend.ok` (all three composed). Permitted ⇒ DRAFT auto-advances to SENT, disposition `auto_executed`. | **Group 2** (auto_advanced, SENT, auto_executed). |
| **Two-NULLs rule** | NULL *cap* = permissive (skip/within); NULL *committed amount* (no NTE) = restrictive (block, `unmeasurable_nte`). | **Group 5** (null-NTE → blocked); the "no caps" within-paths in groups 2/9. |
| **`>= cap` blocks** | A ceiling blocks at-or-above its value; the projected commit must be strictly below to pass. | **Group 4a** (cap 500 < NTE 1000 blocks); **Group 4b** (token cap 500 < 1000 used blocks). |
| **Cumulative-spend breaker** | The committed-$ meter counts a **WORK_COMPLETE** autonomous commit (real spend); it excludes only **DECLINED / CANCELLED** (withdrawn). | **Group 11** (committed delta = 1000.00: WORK_COMPLETE counts, DECLINED/CANCELLED excluded). |
| **NULL-actor job-advance** | The DRAFT→SENT auto-advance, including the NEW/SCHEDULED→DISPATCHED job move, writes cleanly with `changed_by_user_id = NULL` (system actor). | **Group 9** (auto_advanced from NEW, job DISPATCHED, advance history row NULL actor). |
| **Thrown send disposition** | A permitted send that throws records `queued_for_review` + run `status: failed` → `drafted_send_failed`; never `policy_blocked` (policy permitted) nor `auto_executed` (it failed). | Covered by code + decision (`02-decisions.md` (h)); not a standalone harness group (the singleton `db` can't be fault-injected — see `10-known-limitations.md`). |

## The resolution ladder (precedence)

`resolveAgentPolicy` walks: **step 0 kill switch** (above all) → **step 1 per-client policy** →
**step 2 per-tenant policy** → **step 3 platform default** → **step 4 fail-safe**
(`requiresReview:true, autonomyEnabled:false`). Most-specific match wins; no match fails safe.
`autonomyEnabled` requires the literal `true` at the parse boundary; `requiresReview` is true unless
explicitly `false`.
