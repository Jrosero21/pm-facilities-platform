# B-16.4 — Chatbot Knowledge

**Feature:** the operator chatbot's `summarizeVendorPerformance` tool returns a vendor's computed
performance when available.

**Shape (when scores exist):** the `found:true` result carries a `performance` object —
`{ overallScore, completionRate, onTimeRate, totalDispatches, byTrade[] }` — where `overallScore`/
`completionRate`/`onTimeRate` are the **dispatch-weighted rollup** across the vendor's trades (0–100), and
`byTrade` is the per-trade breakdown (`{ tradeId, score, completionRate, onTimeRate, totalDispatches }`).
The accompanying `note` reads "Performance computed from dispatch history (completion-weighted; thin
history shrunk toward average)."

**Shape (no scores yet):** `performance` is `null` and `note` is the profile-only fallback
("…not yet available (banked)"). This happens for vendors with no dispatch history or before the scorer
has run in the environment.

**What the numbers mean:**
- **Score** weights completion (did the work get done?) more than on-time (was it punctual?) — 70/30.
- **Completion %** counts declines and cancels against the vendor.
- **On-time %** is over completed jobs only (arrival ≤ scheduled start).
- **Thin history** is shrunk toward the population average — a few-dispatch vendor won't show extreme
  numbers.

**Scoping:** tenant-isolated — the tool only ever sees the caller's tenant (the vendor id is the only
input; tenant is fixed at bind time).

**Technical:** scorer is `src/server/analytics/vendor-performance.ts`
(`computeVendorPerformanceScores` / `getVendorPerformanceScores`); the chatbot reads via the latter. Gate:
`pnpm run db:check:vendor-performance`.
