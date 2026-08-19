import { describe, expect, it } from "vitest";

import { normalizedLevenshtein } from "@/server/analytics/text-distance";

describe("normalizedLevenshtein", () => {
  it("returns 0 for two identical strings (pinned to early-return behavior)", () => {
    expect(normalizedLevenshtein("abc", "abc")).toBe(0);
    expect(normalizedLevenshtein("", "")).toBe(0);
  });

  it("returns 1 for maximally different strings (disjoint same-length) and for empty/non-empty", () => {
    // For same length strings, fully different => editOps === length.
    expect(normalizedLevenshtein("abc", "def")).toBe(1);

    // One empty and one non-empty => special-case return 1.
    expect(normalizedLevenshtein("", "abc")).toBe(1);
    expect(normalizedLevenshtein("abc", "")).toBe(1);
  });

  it("is case-sensitive because it compares characters directly", () => {
    // 'a' vs 'A' is one substitution, so distance=1/max(1,1)=1.
    expect(normalizedLevenshtein("a", "A")).toBe(1);
  });

  it("pins substitution (one edit) on a short word", () => {
    // "cat" -> "cut" (substitute 'a' -> 'u'): editOps=1, maxLen=3.
    expect(normalizedLevenshtein("cat", "cut")).toBe(1 / 3);
  });

  it("pins insertion (one edit) on a short word", () => {
    // "cat" -> "cats" (insert 's'): editOps=1, maxLen=4.
    expect(normalizedLevenshtein("cat", "cats")).toBe(1 / 4);
  });

  it("pins deletion (one edit) on a short word", () => {
    // "cats" -> "cat" (delete 's'): editOps=1, maxLen=4.
    expect(normalizedLevenshtein("cats", "cat")).toBe(1 / 4);
  });

  it("is symmetric: swapping arguments returns the same value", () => {
    const x = normalizedLevenshtein("cat", "cats");
    const y = normalizedLevenshtein("cats", "cat");
    expect(y).toBe(x);
  });
});
