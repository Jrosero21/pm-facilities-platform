# Phase 29 — Known Limitations

The trigger mechanism is built and sandbox-proven; the following are deliberately deferred or
carried. Honest inventory — Phase 29 closes the *mechanism* Phase 28 named as load-bearing, not the
operational rollout.

## 1. ★ The automated SCHEDULE is NOT wired (deliberate)
There is **no `vercel.json`, no cron entry, nothing on a timer.** Stage 3 (`af55f71`) added a `*/15`
crons entry; `a968728` **removed it**. Autonomous re-dispatch today runs only when an operator clicks
the sweep button or someone calls the endpoint by hand.

**Why deferred, not unfinished:**
- **No live clients.** An unattended timer would fire at test data and prove nothing the sandbox
  harness has not already proven deterministically.
- **Tier mismatch.** Vercel Hobby caps crons at **once per day** — useless against a **2-hour
  EMERGENCY** stuck threshold. Meaningful scheduling needs **Vercel Pro or an external scheduler**: a
  paid infrastructure decision, not a build task.

**Consequence:** autonomy remains *invoked*, not *unattended*. The distinction Phase 28 drew
(§2.3 permission ≠ readiness) still holds one step further along — the mechanism is now ready; the
operation is not.

**Cost to close:** near zero. The route's path and header format already match what Vercel Cron sends,
so the schedule is a one-file addition plus `CRON_SECRET` in the deployed environment. **No route
change.**

## 2. `CRON_SECRET` is not set in any deployed environment
Until it is, the deployed route is **inert** (fails closed). Local/sandbox invocation works. Ships
with #1.

## 3. ★ CORRECTION to the Phase-28 ledger — the retry cap was NOT unbuilt
Phase 28's `10-known-limitations.md` §3 states: *"The bounding guardrail — a per-job 'halt after N
autonomous retries' cap — is unbuilt."*

**That entry was inaccurate when written.** The COUNT cap `REDISPATCH_MAX_ATTEMPTS = 3` shipped **in
Phase 28 itself**, commit `49e76c7` (*"pure decide-core: re-rank fresh, skip tried, cap at 3 /
exhausted"*), and is present on `main`. It is enforced as the first branch of `decideRedispatchCore`.

What was genuinely missing was never the count cap — it was the **RATE** bound. The count cap bounds a
job to 3 attempts *ever*, but leaves an unattended caller free to burn all three in ~45 minutes across
three ticks. A human clicking a button paced re-entry naturally; a trigger does not.

**Resolution:** Phase 29 added the missing rate bound (`REDISPATCH_COOLDOWN_HOURS = 4`). The two
independent bounds — COUNT (Phase 28) and RATE (Phase 29) — **together** close Phase-28 §3. Neither
alone does, and the cooldown by itself does **not** satisfy the limitation as written. See R-29.1.

> Ledger discipline: this supersedes Phase-28 §3. That doc is left as written (phase docs are a
> record, not a live wiki); this entry is the correction of record.

## 4. The "enforced twice" claim is partially verified
`auto-redispatch-sweep.ts`'s header comment states the count cap is *"already enforced twice
(candidate exclusion via `redispatchState 'exhausted_max_attempts'`, and `decideRedispatchCore`)."*

- **`decideRedispatchCore` — confirmed by direct read.** `attemptsSoFar >= REDISPATCH_MAX_ATTEMPTS`
  returns `{ kind: "exhausted", reason: "max_attempts" }` as its first branch.
- **Candidate exclusion — read-verified only at the filter.** The sweep admits solely
  `redispatchState === "can_suggest"`, so an `exhausted_max_attempts` row cannot be a candidate. The
  **state machine that assigns `redispatchState`** inside `getExceptions` was *not* traced end-to-end.

The claim is consistent with everything read and the filter is unambiguous, but the second
enforcement path is asserted from the consuming side, not proven from the producing side. Recorded so
a later reader does not inherit it as fully verified.

## 5. must-notify-client send STILL not wired (carried from Phase 28 §2)
`clients.must_notify_client` remains a **column only**. When an autonomous action fires for a
consented client flagged must-notify, **no client notification is sent** — the obligation is recorded,
not discharged. Gated on #1 (it only fires on an autonomous action), so it did not become reachable
this phase. Ships additively via the Phase-19 send seam, as dispatch-notify did for vendors.

## 6. Auto-dispatch of NEW jobs is still out of scope (carried from Phase 28 §7)
The autonomous path here is **re-dispatch** of stuck jobs. Fully autonomous dispatch of a *new* job on
arrival remains a larger, higher-stakes scope and is not built.

## 7. Open question inherited, still unresolved: should auto-dispatch notify the vendor?
The manual dispatch path sends outbound vendor email via the Phase-19 seam; the **autonomous** paths
(`auto-dispatch.ts`, `redispatch-suggestion.ts`) do not. Phase 29 did not resolve this — it built the
trigger that makes the asymmetry operationally visible. Belongs to the autonomy-enablement package
with #1.

## 8. Performance-ordered fallback still needs data (carried, B-16.4)
Fallback ordering uses the deterministic eligibility matcher. Performance-ordered fallback awaits a
populated `vendor_performance_scores`.

## 9. Policy-conditions authoring UI still absent (carried, CF-28.1)
Conditions are set via `set-agent-conditions-policy.ts`. Build with the deferred Settings surface
(tenant LLM keys, CF-23.1), not as a separate screen.

## 10. Business-hours clock still banked (CF-19.1)
Stuck thresholds are **wall-clock** dwell. A dispatch sent Friday 5pm is "stuck" by Monday regardless
of whether anyone was working. Unchanged by this phase.

---

**Net:** Phase 29 delivers a trigger that is *callable, bounded twice, fully gated, and proven* — but
not *scheduled*. The remaining gap is a paid-tier / live-operation decision, not a missing mechanism.
That is the same shape as Phase 28's closing note, moved one rung along: Phase 28 lacked the
mechanism; Phase 29 lacks only the timer.
