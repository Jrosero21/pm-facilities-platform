# Phase 28 Closeout — Auto-Response Escalation + Policy-Conditions + Client-Autonomy-Consent

## Phase Goal
Complete the v2 arc: a response layer beyond detection (autonomous re-dispatch on stuck/ghost), a richer per-agent policy vocabulary (narrowing conditions), systematized idempotency, and — the net-new close-piece — per-client autonomy consent. Target version **v3.0.0-phase-28** (v2 completion / v3 boundary).

## Completed Deliverables
- **Client-autonomy-consent flag (Batch 1, this phase):** `clients.autonomy_allowed` (opt-in, default false) gating both autonomous paths HOLD-only; `clients.must_notify_client` column; `clientAutonomyConsent` fail-safe helper; `updateClient` audit; minimal `AutonomyConsentToggle`.
- **Policy-conditions vocabulary (post-27):** amount/trade/priority/client evaluator + live-gate wire + validated setter (C1–C3).
- **Auto-response escalation (post-27):** `autoRedispatchForStuckAssignment` (T1) + operator triggers "Auto-retry now" (T2a) and "Auto-retry all eligible" (T2b).
- **Idempotency systematized (post-27):** per-job non-terminal guard, stuck-still-SENT + already_suggested, `ASSIGNMENT_NOT_DRAFT` floor, Resend idempotency key.
- **Guardrail layer (Phase 23 → post-27):** token ceiling, committed-$ meter, kill-switch.

## Files Created or Changed (Batch 1)
- `db/migrations/0005_great_leader.sql` (+ meta) — the two columns.
- `src/server/schema/clients.ts` — `autonomyAllowed`, `mustNotifyClient`.
- `src/server/clients.ts` — `UpdateClientPatch` + audit; `clientAutonomyConsent` helper.
- `src/server/auto-dispatch.ts` — `&& consent.allowed`; `blockedBy` + `decisionMeta`.
- `src/server/auto-redispatch.ts` — `&& consent.allowed`; `blockedBy` + `decisionMeta`.
- `src/app/(app)/clients/actions.ts` — `setClientAutonomyConsentAction`.
- `src/components/autonomy-consent-toggle.tsx` — new toggle.
- `src/app/(app)/clients/[id]/page.tsx` — toggle wired in.
- `docs/phase-28-autonomy-response/` — these eleven docs.

## Database Changes
Migration 0005: `clients.autonomy_allowed` + `clients.must_notify_client`, both boolean NOT NULL default false (additive/zero-downtime). **Applied to all three DBs** — local `pm`, local `pm_sandbox`, and prod Neon (`neondb`). Verified on Neon by read-only introspection: both columns present, `column_default = false`.

## API Routes / Server Actions Added
`setClientAutonomyConsentAction`; `clientAutonomyConsent`; consent conjunct added to `autoDispatchDraftForJob` + `autoRedispatchForStuckAssignment` gates. (See `09-api-routes.md`.)

## User-Facing Workflows Added
Per-client "Autonomy allowed" toggle; operator auto-retry (per-job + sweep) respecting the consent gate. (See `03-user-sop.md`.)

## Admin/Internal Workflows Added
The autonomy control stack (kill-switch → policy → guardrails → conditions → consent → quality). (See `04-admin-sop.md`.)

## Business Rules Added
R-28.1…R-28.8 — opt-in consent, HOLD-only, fail-safe, hard floors, narrowing conditions, re-dispatch≠net-new-spend, recorded-not-discharged notify, full audit. (See `06-business-rules.md`.)

## Chatbot Knowledge Added
See `07-chatbot-knowledge.md` — how autonomy gates, the consent flag, the honest deferrals.

## Verification Performed
Batch-1 probe (`scripts/probe-autonomy-consent.ts`, sandbox, ephemeral — deleted before commit):
```
14 passed, 0 failed  ·  tsc=0  ·  PROBE_EXIT=0
(a) consent=false + autonomy ON → drafted_pending, blockedBy=client_autonomy_not_consented
(b) consent=true + all gates pass → auto_advanced, assignment SENT
(c) HOLD-only: consent=true + kill-switch → still gated
(d) fail-safe: null / unresolvable clientId → allowed:false; consented → true
(e) setter audit change-only; metadata from:false → to:true
(f) off-safe: fresh client defaults autonomy_allowed=false; existing clients unchanged
```
Post-27 engine probes (historical): policy-conditions C1 13/13, C2 6/6; T1 16/16, T2a 9/9 + live-walked, T2b 9/9; Phase-23 autonomy gate suite. Migration 0005 columns verified `default false` on both DBs.

## Known Limitations
Seven deferrals (see `10-known-limitations.md`), led by the **host-gated scheduled trigger** (autonomy is operator-triggered, not unattended) and the **must-notify send** (column only).

## Carry-Forward Items
- Scheduled/unattended trigger (host-dependent) + per-job re-dispatch retry cap — ship together.
- must-notify-client send (reuse Phase-19 seam, client-contact path).
- Performance-ordered fallback (needs `vendor_performance_scores` / B-16.4).
- CF-28.1 policy-conditions authoring UI (shares CF-23.1 Settings surface).
- Confidence-floor conditions (post Phase-24 calibration).
- ~~**Deploy:** apply migration 0005 to Neon; then merge/push; then tag `v3.0.0-phase-28`.~~ **DONE** — 0005 applied to Neon, merged/pushed to `origin/main`, tagged `v3.0.0-phase-28` (both pushed). Prod live and schema-in-sync.

## Recommended Next Phase Focus
A **real-use / operational-efficiency** phase (v3): stand up the host-gated scheduled trigger (with its retry cap), wire the must-notify send, build the deferred Settings/authoring UI, and begin harvesting `vendor_performance_scores` — turning the operator-initiated autonomy into genuine unattended operation on real vendor/client volume. Sender-identity + inbound-reply-routing (banked separately, email-ingestion arc) is the adjacent comms thread.
