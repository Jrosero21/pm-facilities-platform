import { describe, expect, it } from "vitest";
import { formatPercentValue, formatRatioAsPercent } from "@/lib/percent";

describe("formatPercentValue (stored numeric percent, trailing zeros dropped)", () => {
  it.each([
    ["15.00", "15%"],
    ["12.50", "12.5%"],
    ["0.00", "0%"],
    ["7", "7%"],
    ["100.00", "100%"],
    ["-2.50", "-2.5%"],
    ["0.10", "0.1%"],
    ["12.345", "12.35%"],
    ["1000.00", "1000%"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatPercentValue(input)).toBe(expected);
  });

  it.each([["-0.001"], ["0.004"]])("renders %s as 0%% with no negative-zero leak", (input) => {
    expect(formatPercentValue(input)).toBe("0%");
  });

  it.each([[null], [undefined], [""]])("renders the em dash for %s", (input) => {
    expect(formatPercentValue(input as string | null | undefined)).toBe("—");
  });

  it("throws TypeError on a non-decimal string", () => {
    expect(() => formatPercentValue("abc")).toThrow(TypeError);
  });
});

describe("formatRatioAsPercent (0-1 ratio, trailing zeros KEPT)", () => {
  it.each([
    [0.876, undefined, "88%"],
    [0.5, undefined, "50%"],
    [1, undefined, "100%"],
    [0, undefined, "0%"],
    [1.5, undefined, "150%"],
    [-0.25, undefined, "-25%"],
    [0.8765, 2, "87.65%"],
    [0.125, 1, "12.5%"],
    [0.5, 2, "50.00%"],
    [0.005, 0, "1%"],
  ])("formats %s with %s decimals as %s", (ratio, decimals, expected) => {
    expect(formatRatioAsPercent(ratio, decimals)).toBe(expected);
  });

  // 0.1 + 0.2 is 0.30000000000000004 — Big must absorb it, not print it.
  it("is float-safe", () => {
    expect(formatRatioAsPercent(0.1 + 0.2, 1)).toBe("30.0%");
  });

  it.each([[null], [undefined]])("renders the em dash for %s", (input) => {
    expect(formatRatioAsPercent(input as number | null | undefined)).toBe("—");
  });

  it.each([[-1], [1.5]])("throws RangeError for a decimals argument of %s", (decimals) => {
    expect(() => formatRatioAsPercent(0.5, decimals)).toThrow(RangeError);
  });
});
