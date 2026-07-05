# Phase 28 — Known Limitations

The engine and gates are built; the following are deliberately deferred. Honest inventory — Phase 28 closes the v2 arc's *mechanism*, not every operational leaf. Most deferrals converge on one dependency: a **host-gated scheduled trigger**.

## 1. ★ No scheduled / unattended trigger (LOAD-BEARING)
The escalation engine (T1) and buttons (T2a/T2b) exist, but **nothing fires them automatically**. A cron / HTTP-pinged scheduled trigger is host-dependent and not built. **Consequence:** autonomy today is *operator-button-triggered*, not truly unattended — the conditions, guardrails, and consent govern a path a human still starts (CF-24.2; §2.3 permission ≠ readiness). This is the single deferral that makes several others moot until it lands.

## 2. must-notify-client send NOT wired
`clients.must_notify_client` is a **column only**. When an autonomous action fires for a consented client flagged must-notify, **no client notification is sent** — the obligation is recorded, not discharged. Deferred with #1 (the send only fires on an autonomous action). Documented in the schema comment and the toggle copy. Ships additively later (reuses the Phase-19 send seam against the client-contact path, like dispatch-notify did for vendors).

## 3. Per-job re-dispatch retry cap NOT built
Because re-dispatch is exempt from the aggregate dollar ceiling (R-28.6), a misfiring trigger could re-dispatch one job many times. The bounding guardrail — a per-job "halt after N autonomous retries" cap — is unbuilt. It is only reachable by the scheduled trigger, so it ships **with** #1.

## 4. Performance-ordered fallback needs data (B-16.4)
The roadmap's "ranked fallback chain ordered by `vendor_performance_scores`" needs that table populated. Today the fallback uses the deterministic eligibility matcher's ordering. Performance-ordered fallback is deferred until `vendor_performance_scores` exists (B-16.4, the Phase-27 data dependency).

## 5. Policy-conditions authoring UI (CF-28.1) NOT built
The conditions evaluator + live gate + validated setter are shipped, but there is **no in-app editor** — conditions are set via the `set-agent-conditions-policy.ts` script. Shares the same deferred Settings surface as tenant LLM keys (CF-23.1); build together, not as a separate screen.

## 6. Confidence-floor conditions EXCLUDED
The conditions vocabulary omits confidence floors (e.g. "≥95%"). They are only meaningful after Phase-24 calibrates confidence; gating on an uncalibrated number would be false precision. Amount / trade / priority / client are the shipped conditions.

## 7. Auto-dispatch of NEW jobs (vs re-dispatch) is a separate, bigger scope
The autonomous path built here is **re-dispatch** of stuck jobs. Fully autonomous dispatch of a *new* job the moment it arrives is a larger, higher-stakes scope and is not built. `auto-dispatch.ts` is gate-capable and consent-aware, but is exercised by the same operator-triggered / rule paths, not an autonomous NEW-job trigger.

---

**Net:** Phase 28's autonomy is real but *operator-initiated behind a full permission gate*. True unattended operation, the client-notification send, the retry cap, and performance-ordered fallback are the real-use / host-gated follow-ons — appropriately a v3 concern.
