// ── Phase 27 batch 4b — STRING DISTANCE (pure util) ───────────────────────────────────
// PURE util — NO "server-only", NO DB, NO IO. A normalized edit distance, consumed by the
// proposal correction-signal classifier (correction-pairs.ts) and the proposal approve-as-is
// reader (agent-observability.ts). Mirrors the percentile.ts / money.ts pure-util precedent:
// file location communicates "general string helper", not "reader-specific".

/**
 * Normalized Levenshtein distance between two strings: 0 (identical) … 1 (maximally different).
 * distance = editOps / max(len(a), len(b)). Two empty strings are identical (0); one empty and
 * one non-empty are maximally different (1). Two-row DP, O(a·b) time, O(b) space. No deps.
 */
export function normalizedLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0 || bl === 0) return 1;

  let prev = Array.from({ length: bl + 1 }, (_, j) => j);
  for (let i = 1; i <= al; i++) {
    const curr = [i];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[bl] / Math.max(al, bl);
}
