import { describe, expect, it } from "vitest";

import { percentile, summarizeSeconds } from "./percentile";

describe("percentile", () => {
  it("returns 0 for an empty array", () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it("returns the only element for a single-element array", () => {
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 1)).toBe(7);
  });

  it("returns the first element for q=0 on a multi-element array", () => {
    // sortedAsc: [10, 20, 30]
    // idx=(n-1)*q=(2)*0=0 → lo=hi=0
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });

  it("returns the last element for q=1 on a multi-element array", () => {
    // idx=(n-1)*q=(2)*1=2 → lo=hi=2
    expect(percentile([10, 20, 30], 1)).toBe(30);
  });

  it("returns an exact element when q places idx exactly on an index (no interpolation)", () => {
    const sortedAsc: number[] = [10, 20, 30, 40];
    // n=4 → (n-1)=3. Choose q=1/3 so idx=1 exactly.
    // lo=hi=1 → returns sortedAsc[1] without interpolation.
    expect(percentile(sortedAsc, 1 / 3)).toBe(20);
  });

  it("linearly interpolates between neighbours when idx falls between two indices", () => {
    const sortedAsc: number[] = [10, 20, 30, 40];
    // idx = (n-1)*q = 3 * 0.25 = 0.75
    // lo=0 (10), hi=1 (20)
    // interpolation = 10 + (20-10)*(0.75-0) = 10 + 10*0.75 = 17.5
    expect(percentile(sortedAsc, 0.25)).toBe(17.5);
  });
});

describe("summarizeSeconds", () => {
  it("returns the exact empty-array result", () => {
    expect(summarizeSeconds([])).toEqual({
      count: 0,
      p50Seconds: 0,
      p90Seconds: 0,
      meanSeconds: 0,
    });
  });

  it("rounds p50/p90/mean to integer seconds and does not mutate or reorder the caller array", () => {
    const input: number[] = [60, 10, 20];
    const originalSnapshot: number[] = [...input];

    // After internal sort, values become [10,20,60].
    // percentile([10,20,60],0.5): n=3, idx=(2)*0.5=1 → exact element at index 1 → 20
    // percentile([10,20,60],0.9): idx=2*0.9=1.8
    // lo=1 (20), hi=2 (60)
    // linear = 20 + (60-20)*(1.8-1) = 20 + 40*0.8 = 52
    // mean = round((60+10+20)/3)=round(90/3)=30
    // So expected: p50=20, p90=52, mean=30.

    expect(summarizeSeconds(input)).toEqual({
      count: 3,
      p50Seconds: 20,
      p90Seconds: 52,
      meanSeconds: 30,
    });

    expect(input).toEqual(originalSnapshot);
  });
});
