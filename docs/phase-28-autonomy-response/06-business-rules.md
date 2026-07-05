# Phase 28 — Business Rules

## R-28.1 — Autonomy consent is opt-in and affirmative
A client is acted on autonomously only when `clients.autonomy_allowed = true`. Default false. No backfill, no implicit grant. (D-28.1)

## R-28.2 — Every autonomy guard HOLDs, never widens
The permitted chain is pure AND. Kill-switch, `autonomyEnabled`, token ceiling, committed-$ ceiling, policy-conditions, quality bar, and client consent can each only block. No layer — including a granted consent or a passing condition — can force an action that another layer holds. (D-28.2)

## R-28.3 — Fail-safe toward gated
Any unresolvable input resolves toward *gated*: no policy → held; unreadable policy → held; null/unknown NTE against a spend cap → held; null/unresolvable client for consent → held. Absence of an explicit "yes" is "no". (§2.1, D-28.3)

## R-28.4 — Hard eligibility floors are never crossed by autonomy
Trade match, compliance, and blocklist remain **hard** exclusions for any autonomous pick — an ineligible vendor is never dispatched, autonomously or otherwise. Geo is a **hard floor for autonomy** (the §2.5 correction: manual dispatch may surface out-of-area vendors as a search-aid with an audited override, but the autonomous path only acts within the geo floor). Policy-conditions and consent narrow *within* the eligible set; they never relax the floor.

## R-28.5 — Policy-conditions are narrowing-only, on stable keys
Conditions restrict autonomy (amount / trade / priority / client). They match on stable keys (`trades.code`, `priorities.code`, `clients.id`), never display names. Absent conditions = no narrowing (backward-compatible no-op). Invalid conditions = fail-safe gated. Confidence floors are excluded pending Phase-24 calibration. (D-28.7)

## R-28.6 — Autonomous re-dispatch is not net-new spend
A re-dispatch re-sends the same job at the same NTE to a different vendor; it does not add to the aggregate committed-$ ceiling. Runaway-retry protection is a separate per-job retry cap (unbuilt), not the dollar ceiling. The per-job committed cap still guards each individual send. (D-28.8, CF-28.2 resolved)

## R-28.7 — Client-notification obligation is recorded, not yet discharged
`must_notify_client` expresses the contractual obligation to notify a client on an autonomous action. This phase records the flag; the actual client notification is not sent yet (deferred with the scheduled trigger). Setting the flag today does not produce a message. (D-28.4)

## R-28.8 — Every autonomous decision is audited
Each run records disposition (`auto_executed` / `policy_blocked`), the gate outcome (`blockedBy`), and `clientAutonomyAllowed`. Consent changes write `client.autonomy_consent_changed` (before→after, change-only). Autonomous actions use the system actor. (§2.2)
