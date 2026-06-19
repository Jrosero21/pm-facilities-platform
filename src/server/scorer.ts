import type { VendorCandidate } from "./vendor-matching";

/**
 * AI-assisted dispatch — deterministic dispatch scorer.
 * Ranks an already-eligible candidate set by the tenant-confirmed priority:
 *   1. Preferred vendor for the location  (dispositive when eligible)
 *   2. Track record                        (volume-confidence-shrunk)
 *   3. Trade fit / geo / name              (inherited from the matcher's order)
 * Pure + deterministic. The LLM tiebreaker (Batch B) layers on top and never
 * replaces this; if the LLM is unavailable, this ranking stands alone.
 */

export const TRACK_RECORD_PRIOR = 0.5;     // neutral middle for an unproven vendor
export const SHRINKAGE_STRENGTH = 5;       // pseudo-count: dispatches needed to half-trust the raw rate
export const TIEBREAK_EPSILON = 0.05;      // top two within this band => eligible for LLM tiebreak (Batch B)

export type ScoredCandidate = VendorCandidate & {
  trackRecordScore: number; // 0..1, volume-shrunk; equals the prior when there is no record
  hasRecord: boolean;       // false when no performance row existed for this vendor+trade
};

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Shrink a normalized 0..1 rate toward the neutral prior by volume.
 * n=0 returns the prior exactly, so unproven and zero-volume collapse to the
 * same neutral value. A thin record cannot leapfrog a thick one.
 */
export function shrinkScore(
  rawNormalized: number,
  n: number,
  opts: { prior?: number; k?: number } = {},
): number {
  const prior = opts.prior ?? TRACK_RECORD_PRIOR;
  const k = opts.k ?? SHRINKAGE_STRENGTH;
  const safeN = Number.isFinite(n) && n > 0 ? n : 0;
  const safeRaw = Number.isFinite(rawNormalized) ? clamp01(rawNormalized) : prior;
  return (safeRaw * safeN + prior * k) / (safeN + k);
}

/** A numbered preference always precedes "no preference" (null); lower number = stronger. */
function comparePreference(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Stable lexicographic rank: preference, then track record (desc). Candidates
 * equal on both keep the matcher's incoming order (trade-fit -> geo -> name),
 * guaranteed via an explicit incoming-index tiebreak (not relying on engine sort stability).
 */
export function rankCandidates(scored: ScoredCandidate[]): ScoredCandidate[] {
  return scored
    .map((c, i) => ({ c, i }))
    .sort((x, y) => {
      const pref = comparePreference(x.c.preferenceRank, y.c.preferenceRank);
      if (pref !== 0) return pref;
      if (x.c.trackRecordScore !== y.c.trackRecordScore) {
        return y.c.trackRecordScore - x.c.trackRecordScore;
      }
      return x.i - y.i;
    })
    .map(({ c }) => c);
}

/**
 * Top two too close on track record to separate deterministically AND not already
 * settled by preference -> the only case the LLM tiebreaker (Batch B) may act on.
 */
export function isCloseCall(ranked: ScoredCandidate[]): boolean {
  if (ranked.length < 2) return false;
  const [a, b] = ranked;
  if (comparePreference(a.preferenceRank, b.preferenceRank) !== 0) return false;
  return Math.abs(a.trackRecordScore - b.trackRecordScore) < TIEBREAK_EPSILON;
}

/**
 * Minimal structural shape the adapter needs from a performance row.
 * VendorPerformanceScoreRow (analytics/vendor-performance.ts) satisfies this
 * — decimals arrive as strings, ints as numbers — so Batch C passes reader
 * rows straight in with no mapping.
 */
export type TrackRecordInput = {
  completionRate: string | null;
  totalDispatches: number | null;
};

/**
 * Attach a 0..1 volume-shrunk trackRecordScore to an eligible candidate.
 * Stored completion_rate is on a 0..100 scale -> divide by 100 for the raw rate.
 *   - usable completionRate present -> completionRate/100, shrunk by totalDispatches
 *   - row absent / null / empty / non-numeric -> unproven: prior, hasRecord=false
 *   - row present but no volume (n<=0) -> rate untrusted -> shrink collapses to prior
 * Pure. No DB. Batch C fetches the row (for the job's primary trade) and passes it (or null).
 */
export function toScoredCandidate(
  candidate: VendorCandidate,
  record: TrackRecordInput | null,
): ScoredCandidate {
  if (record == null || record.completionRate == null || record.completionRate === "") {
    return { ...candidate, trackRecordScore: TRACK_RECORD_PRIOR, hasRecord: false };
  }
  const parsed = Number(record.completionRate);
  if (!Number.isFinite(parsed)) {
    return { ...candidate, trackRecordScore: TRACK_RECORD_PRIOR, hasRecord: false };
  }
  const n =
    typeof record.totalDispatches === "number" && Number.isFinite(record.totalDispatches)
      ? record.totalDispatches
      : 0;
  return {
    ...candidate,
    trackRecordScore: shrinkScore(parsed / 100, n),
    hasRecord: true,
  };
}
