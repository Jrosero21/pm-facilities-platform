import { describe, expect, it } from "vitest";

import {
  SHRINKAGE_STRENGTH,
  TIEBREAK_EPSILON,
  TRACK_RECORD_PRIOR,
  isCloseCall,
  rankCandidates,
  shrinkScore,
  toScoredCandidate,
} from "./scorer";
import type { VendorCandidate } from "./vendor-matching";

describe("scorer constants", () => {
  it("pins shipped numeric configuration", () => {
    expect(TRACK_RECORD_PRIOR).toBe(0.5);
    expect(SHRINKAGE_STRENGTH).toBe(5);
    expect(TIEBREAK_EPSILON).toBe(0.05);
  });
});

describe("shrinkScore", () => {
  it("shrinks toward prior using the exact weighted formula", () => {
    // safeRaw = clamp01(0.9) = 0.9
    // result = (raw*n + prior*k)/(n+k)
    const rawNormalized = 0.9;
    const n = 2;
    const prior = TRACK_RECORD_PRIOR;
    const k = SHRINKAGE_STRENGTH;
    const expected = (rawNormalized * n + prior * k) / (n + k);

    expect(shrinkScore(rawNormalized, n)).toBe(expected);
  });

  it("collapses to TRACK_RECORD_PRIOR when n<=0 (e.g. zero dispatches)", () => {
    // safeN=0, so result = (raw*0 + prior*k)/(0+k) = prior
    expect(shrinkScore(0.9, 0)).toBe(TRACK_RECORD_PRIOR);
  });

  it("treats non-finite raw as prior", () => {
    const expected = TRACK_RECORD_PRIOR;
    expect(shrinkScore(Number.NaN, 10)).toBe(expected);
  });
});

describe("rankCandidates", () => {
  const base: VendorCandidate[] = [
    {
      vendorId: "vA",
      tradeId: "t1",
      preferenceRank: 2,
      candidateName: "A",
      geoDistanceKm: 12,
      // other fields (if present) are irrelevant to rankCandidates
    } as unknown as VendorCandidate,
    {
      vendorId: "vB",
      tradeId: "t1",
      preferenceRank: 1,
      candidateName: "B",
      geoDistanceKm: 11,
    } as unknown as VendorCandidate,
    {
      vendorId: "vC",
      tradeId: "t1",
      preferenceRank: 1,
      candidateName: "C",
      geoDistanceKm: 10,
    } as unknown as VendorCandidate,
  ];

  it("orders by preferenceRank asc, then trackRecordScore desc, then preserves incoming order", () => {
    const scored = [
      { ...base[0], trackRecordScore: 0.1, hasRecord: true }, // pref 2
      { ...base[1], trackRecordScore: 0.2, hasRecord: true }, // pref 1
      { ...base[2], trackRecordScore: 0.2, hasRecord: false }, // pref 1, equal track => incoming order tie
    ];

    const ranked = rankCandidates(scored);

    expect(ranked[0]).toBe(scored[1]);
    // equal preference + equal track => incoming index preserved
    expect(ranked[1]).toBe(scored[2]);
    expect(ranked[2]).toBe(scored[0]);
  });

  it("returns an empty array unchanged (no candidates)", () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it("keeps incoming order when everything ties", () => {
    const scored = [
      { ...base[1], trackRecordScore: 0.3, hasRecord: true },
      { ...base[2], trackRecordScore: 0.3, hasRecord: true },
    ];
    const ranked = rankCandidates(scored);
    expect(ranked[0]).toBe(scored[0]);
    expect(ranked[1]).toBe(scored[1]);
  });
});

describe("isCloseCall", () => {
  function make(
    preferenceRank: number | null,
    trackRecordScore: number,
  ): VendorCandidate & { trackRecordScore: number; hasRecord: boolean } {
    const c = {
      vendorId: "v",
      tradeId: "t",
      preferenceRank,
      candidateName: "n",
      geoDistanceKm: 0,
    } as unknown as VendorCandidate;
    return { ...c, trackRecordScore, hasRecord: true };
  }

  it("returns false when there are fewer than two candidates", () => {
    expect(isCloseCall([])).toBe(false);
    expect(isCloseCall([make(1, 0.2)])).toBe(false);
  });

  it("returns false when preferenceRank differs", () => {
    const a = make(1, 0.9);
    const b = make(2, 0.9001);
    expect(isCloseCall([a, b])).toBe(false);
  });

  it("turns on when the top-two trackRecordScore gap is just inside TIEBREAK_EPSILON", () => {
    // compare uses: abs(diff) < TIEBREAK_EPSILON
    const gap = TIEBREAK_EPSILON - 0.0000001;
    const a = make(1, 0.5);
    const b = make(1, 0.5 + gap);
    expect(isCloseCall([a, b])).toBe(true);
  });

  it("turns off when the top-two trackRecordScore gap is exactly at/beyond TIEBREAK_EPSILON", () => {
    const a = make(1, 0.5);

    // diff == TIEBREAK_EPSILON => not < => false
    const bAt = make(1, 0.5 + TIEBREAK_EPSILON);
    expect(isCloseCall([a, bAt])).toBe(false);

    // diff slightly greater => false
    const bOut = make(1, 0.5 + TIEBREAK_EPSILON + 0.0000001);
    expect(isCloseCall([a, bOut])).toBe(false);
  });
});

describe("toScoredCandidate", () => {
  const candidateBase: VendorCandidate = {
    vendorId: "v1",
    preferenceRank: 1,
    candidateName: "PreferredCo",
    geoDistanceKm: 3,
  } as unknown as VendorCandidate;

  it("uses shrinkScore(completionRate/100, totalDispatches) when the record is present and numeric", () => {
    const record = { completionRate: "80", totalDispatches: 2 };
    const parsedRaw = 0.8;
    const expectedTrack = shrinkScore(parsedRaw, 2);

    const scored = toScoredCandidate(candidateBase, record);
    expect(scored.trackRecordScore).toBe(expectedTrack);
    expect(scored.hasRecord).toBe(true);

    // pins that candidate shape is preserved
    expect(scored.vendorId).toBe(candidateBase.vendorId);
    expect(scored.preferenceRank).toBe(candidateBase.preferenceRank);
  });

  it("shrinks to prior and sets hasRecord=false when record is null (unproven vendor)", () => {
    const scored = toScoredCandidate(candidateBase, null);
    expect(scored.trackRecordScore).toBe(TRACK_RECORD_PRIOR);
    expect(scored.hasRecord).toBe(false);
  });

  it("sets hasRecord=false when completionRate is empty string", () => {
    const scored = toScoredCandidate(candidateBase, {
      completionRate: "",
      totalDispatches: 123,
    });
    expect(scored.trackRecordScore).toBe(TRACK_RECORD_PRIOR);
    expect(scored.hasRecord).toBe(false);
  });

  it("sets hasRecord=false when completionRate is non-numeric", () => {
    const scored = toScoredCandidate(candidateBase, {
      completionRate: "not-a-number",
      totalDispatches: 10,
    });
    expect(scored.trackRecordScore).toBe(TRACK_RECORD_PRIOR);
    expect(scored.hasRecord).toBe(false);
  });

  it("collapses to prior when totalDispatches<=0 even if completionRate is present", () => {
    const record = { completionRate: "90", totalDispatches: 0 };
    const scored = toScoredCandidate(candidateBase, record);
    // shrinkScore(parsed/100, 0) => prior exactly
    expect(scored.trackRecordScore).toBe(TRACK_RECORD_PRIOR);
    expect(scored.hasRecord).toBe(true);
  });
});
