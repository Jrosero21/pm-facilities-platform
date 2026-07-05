# Phase 28 — Technical Decisions

## D-28.1 — Consent is OPT-IN (default false), not opt-out
`clients.autonomy_allowed` defaults **false**. Autonomy is **held** on every client until an operator affirmatively consents. Rationale: consent is an affirmative, contractual concept, and this matches the fail-safe discipline used everywhere else in the autonomy stack (§2.1 — `autonomyEnabled` requires literal `true`; the policy resolver fails to `{ requiresReview: true }`). Trade-off acknowledged: default-false means the tenant-level autonomy switch has no effect on any client until that client is individually consented. That is the intended safety posture — no client is acted on autonomously by surprise.

## D-28.2 — The consent check is a HOLD-only gate conjunct
`consent.allowed` is appended to the existing `permitted` composition as one more `&&` term at both autonomous sites:
```
permitted = resolved.autonomyEnabled && token.ok && spend.ok && conditionsResult.pass && quality.ok && consent.allowed
```
It can only make `permitted` **false**, never widen it. This mirrors how policy-conditions were wired (a narrowing below `autonomyEnabled`, never an override). A consented client whose tenant has autonomy off, or who trips a guardrail, still does not auto-act.

## D-28.3 — `clientAutonomyConsent` fail-safes toward gated
The helper resolves a **null clientId** (job with no client) or an **unresolvable/cross-tenant client** to `{ allowed: false }`. It never throws. Absence of a clear "yes" is treated as "no" — consistent with the resolver's fail-safe.

## D-28.4 — must-notify is a COLUMN now, SEND deferred
`clients.must_notify_client` is built (schema + setter + both DBs) but **no send is wired**. Reason: the client notification fires only when an autonomous action fires, and the unattended trigger that would exercise it is host-deferred (D-28.5). Building the send now would be dead code. The column is laid down so the later send batch is additive.

## D-28.5 — The scheduled/automatic trigger is host-deferred
The escalation engine (T1) and operator-triggered buttons (T2a/T2b) are built, but a **cron/HTTP-pinged scheduled trigger** that fires them unattended is host-dependent and not built. The manual button is the no-host cut. Consequence: today the autonomy is *operator-initiated*; §2.3 permission ≠ readiness holds — the conditions and consent govern a path that a human still starts. This is the load-bearing deferral (CF-24.2).

## D-28.6 — Performance-ordered fallback blocked on data (B-16.4)
The roadmap's "ranked fallback chain where `vendor_performance_scores` orders the fallback" needs that table populated (B-16.4, the Phase-27 data dependency). Today the fallback uses the deterministic eligibility matcher's ordering. Performance-ordered fallback is deferred until the data exists.

## D-28.7 — Confidence-floor conditions excluded
The policy-conditions vocabulary intentionally omits confidence floors (e.g. "≥95%"). They are only meaningful once Phase-24 calibrates confidence; until then a floor would gate on an uncalibrated number. Amount / trade / priority / client conditions are the shipped vocabulary.

## D-28.8 — Re-dispatch is NOT net-new spend (CF-28.2, resolved)
A normal autonomous re-dispatch (same job, same NTE, different vendor) does **not** count against the aggregate committed-$ ceiling. Rationale: one job retrying to find a willing vendor is one piece of work. The dollar ceiling stays a clean "total committed dollars" measure; the runaway-retry risk is assigned to a **separate** per-job retry cap (unbuilt, D-28.5-adjacent), not by overloading the ceiling.

## D-28.9 — Mirror the client-priority pattern exactly
The consent flag reuses the proven `is_priority` shape end-to-end: additive boolean migration (mirrors `0003`), `updateClient` patch + change-only audit (`client.autonomy_consent_changed` mirrors `client.priority_flag_changed`), and a minimal `AutonomyConsentToggle` (mirrors `PriorityClientToggle`). Lower risk than a bespoke surface.
