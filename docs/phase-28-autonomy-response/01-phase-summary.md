# Phase 28 — Auto-Response Escalation + Policy-Conditions (Phase Summary)

**Version:** v3.0.0-phase-28 — the v2 arc's completion / v3 boundary.

## Goal
The destination beyond *detection*: a **response layer** (the aggregator recovers from a failed dispatch without a human) and a **richer policy vocabulary** (tenants compose narrow autonomy conditions), all remaining idempotent and — new in this phase — **client-consent-aware**.

## What Phase 28 is
Phase 28 is not a single-batch build. Its engine was assembled incrementally across post-Phase-27 iteration, and the one genuinely-net-new close-piece (client-autonomy-consent) shipped as this phase's Batch 1. Honest inventory:

| Piece | Where it landed | State |
|---|---|---|
| **Policy-conditions vocabulary** (amount / trade / priority / client) | post-27 (C1–C3, `b5f6606`→`2f12c5f`) | **Built** — evaluator + live-gate wire + validated setter |
| **Auto-response escalation** (autonomous re-dispatch to vendor B on stuck/ghost) | post-27 (T1 `b59101f`, T2a `89fc02a`, T2b) | **Built** — engine + operator-triggered buttons |
| **Idempotency systematized** across autonomous paths | post-27 (dispatch + re-dispatch + send) | **Built** |
| **Guardrail layer** (token ceiling, committed-$ meter, kill-switch) | Phase 23 → post-27 | **Built** |
| **Client-autonomy-consent flag** | **Phase 28 Batch 1** (`3f15447`, migration 0005) | **Built (this phase)** |

## What is deliberately deferred (see `10-known-limitations.md`)
The **scheduled/automatic trigger** that would fire the escalation engine unattended is **host-dependent and not built** — today autonomy is operator-*button*-triggered, not truly unattended. The **must-notify-client send** is column-only (send not wired). The **per-job re-dispatch retry cap**, **performance-ordered fallback** (needs `vendor_performance_scores`), and the **policy-conditions authoring UI** (CF-28.1) are banked. **Confidence-floor** conditions are excluded (blocked on Phase-24 calibration).

## Why this closes the v2 arc
Every numbered v2 phase (18–27) shipped and is doc-complete; Phase 28 was the single remaining phase. With the consent flag built and the engine assembled, the mechanism for "manage-by-exception with an autonomous response layer" exists end-to-end. The remaining gap is the **host-gated scheduled trigger** — an infrastructure decision, not a missing mechanism — which is why Phase 28 closes the v2 arc and opens the v3 boundary rather than being blocked by it.
