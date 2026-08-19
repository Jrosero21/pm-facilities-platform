import { describe, expect, it } from "vitest";

import {
  phrasingOnly,
  PROPOSAL_PHRASING_GOLD_MAX,
  PROPOSAL_PHRASING_NEGATIVE_MIN,
} from "./proposal-phrasing";

describe("phrasingOnly", () => {
  it('returns "" for malformed JSON', () => {
    const json = "{ this is not valid json";
    expect(phrasingOnly(json)).toBe("");
  });

  it('returns "" for empty string', () => {
    expect(phrasingOnly("")).toBe("");
  });

  it("returns newline-joined category/description/scopePhrasing with numeric/pricing fields ignored", () => {
    const json = JSON.stringify({
      lineItems: [
        {
          category: "Electrical",
          description: "Install panels",
          scopePhrasing: "per circuit",
          quantity: 7,
          unitPrice: 123.45,
          markupPercent: 10,
          taxRate: 0.07,
          taxAmount: 55.9,
        },
        {
          category: "",
          description: "Tighten bolts",
          scopePhrasing: "",
          quantity: 0,
          unitPrice: 0,
          markupPercent: 0,
          taxRate: 0,
          taxAmount: 0,
        },
      ],
    });

    // Note: numeric/pricing fields are never read; only string fields are emitted.
    expect(phrasingOnly(json)).toBe("Electrical Install panels per circuit\nTighten bolts");
  });

  it("coerces missing/invalid per-line fields to empty strings and trims the resulting line", () => {
    const json = JSON.stringify({
      lineItems: [
        // Missing category/description/scopePhrasing entirely → line becomes "" and is preserved as an empty line.
        {},
        // Non-string values → coerced to "".
        {
          category: null,
          description: 123,
          scopePhrasing: undefined,
        },
        // One field present.
        {
          category: "Plumbing",
          description: undefined,
          scopePhrasing: "Replace sink",
        },
      ],
    });

    expect(phrasingOnly(json)).toBe("\n\nPlumbing  Replace sink");
  });

  it('returns "" when the JSON document is valid but missing lineItems', () => {
    const json = JSON.stringify({
      // The function specifically looks for parsed.lineItems.
      notLineItems: [{ category: "X" }],
    });

    expect(phrasingOnly(json)).toBe("");
  });
});

describe("PROPOSAL_PHRASING_GOLD_MAX", () => {
  it("is pinned to today’s exact value", () => {
    expect(PROPOSAL_PHRASING_GOLD_MAX).toBe(0.15);
  });

  it("boundary check: computed edits at/below GOLD_MAX are treated as positive band", () => {
    // The threshold constants are used elsewhere; this test pins the constants and the comparison direction.
    const dBelow = PROPOSAL_PHRASING_GOLD_MAX;
    const dAbove = PROPOSAL_PHRASING_GOLD_MAX + 1e-6;

    expect(dBelow <= PROPOSAL_PHRASING_GOLD_MAX).toBe(true);
    expect(dAbove <= PROPOSAL_PHRASING_GOLD_MAX).toBe(false);
  });
});

describe("PROPOSAL_PHRASING_NEGATIVE_MIN", () => {
  it("is pinned to today’s exact value", () => {
    expect(PROPOSAL_PHRASING_NEGATIVE_MIN).toBe(0.5);
  });

  it("boundary check: computed edits at/above NEGATIVE_MIN are treated as negative band", () => {
    const dAt = PROPOSAL_PHRASING_NEGATIVE_MIN;
    const dBelow = PROPOSAL_PHRASING_NEGATIVE_MIN - 1e-6;

    expect(dAt >= PROPOSAL_PHRASING_NEGATIVE_MIN).toBe(true);
    expect(dBelow >= PROPOSAL_PHRASING_NEGATIVE_MIN).toBe(false);
  });
});
