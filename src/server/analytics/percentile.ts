// ── Phase 9 batch 9c — PERCENTILE / DISTRIBUTION-SUMMARY (pure util) ──────────────────
// PURE util — NO "server-only", NO DB, NO IO. General statistical helpers over second-valued
// interval arrays, consumed by the distribution readers (time-in-status, dispatch-timing) and any
// future analytics that summarize durations. Extracted at 9c.6 from time-in-status.ts once a second
// consumer appeared (mirrors the billing money.ts / role-gates.ts pure-util precedent; file location
// now communicates "general statistic", not "reader-specific").

/** Continuous (linear-interpolation, "type 7" / PERCENTILE_CONT) percentile of an ASC-sorted array. */
export function percentile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const idx = (n - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

/** Summarize a set of interval durations (seconds) → {count, p50, p90, mean}, all integer seconds.
 *  The single distribution-summary helper for the analytics layer. */
export function summarizeSeconds(values: number[]): {
  count: number;
  p50Seconds: number;
  p90Seconds: number;
  meanSeconds: number;
} {
  const n = values.length;
  if (n === 0) return { count: 0, p50Seconds: 0, p90Seconds: 0, meanSeconds: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: n,
    p50Seconds: Math.round(percentile(sorted, 0.5)),
    p90Seconds: Math.round(percentile(sorted, 0.9)),
    meanSeconds: Math.round(sum / n),
  };
}
