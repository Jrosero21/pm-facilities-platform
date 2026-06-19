# B-16.4 — API Routes / Server Functions

**No new HTTP routes.** B-16.4 adds two server-side functions + extends one chatbot tool.

## Server functions (`src/server/analytics/vendor-performance.ts`, `server-only`)

### `computeVendorPerformanceScores(tenantId): Promise<VendorPerformanceRollupResult>`
The populator. Reads the tenant's dispatch history, computes per-(vendor,trade) scores (two-pass:
raw rates → population-mean shrinkage → composite), and writes `vendor_performance_scores`
(delete-then-insert in a tx). Returns `{ groupsWritten, vendorsCovered, populationMeanCompletion,
populationMeanOnTime }`.

### `getVendorPerformanceScores(tenantId, vendorId): Promise<VendorPerformanceScoreRow[]>`
The reader. Returns the active score rows for a vendor (all trades), tenant-scoped. Decimal columns come
back as `string | null` (caller coerces).

## Chatbot tool (extended, not new)
`summarizeVendorPerformanceTool` (`src/server/agents/chatbot-assistant/operational-tools.ts`) now calls
`getVendorPerformanceScores` and returns a `performance` object (dispatch-weighted rollup + `byTrade[]`)
on the `found:true` branch, or `null` + the profile-only note when no scores exist. `VendorSummary` was
extended additively; no registration change.

## Invocation
The populator is invoked programmatically / by the harness — **no cron or scheduled trigger yet** (a
scheduled recompute is a future add). The reader is invoked by the chatbot tool at query time.
