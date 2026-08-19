import { describe, expect, it } from "vitest";

import {
  FOLLOW_UP_CATEGORIES,
  FOLLOW_UP_CATEGORY_LABELS,
  isFollowUpCategory,
} from "@/lib/follow-up";

describe("FOLLOW_UP_CATEGORIES (manifest)", () => {
  it("is an exact array in exact order", () => {
    expect(FOLLOW_UP_CATEGORIES).toEqual([
      "vendor_followup",
      "confirm_onsite",
      "proposal_followup",
      "general",
    ]);
  });
});

describe("FOLLOW_UP_CATEGORY_LABELS (manifest)", () => {
  it("has exactly one label per category and no extra keys", () => {
    const keys = Object.keys(FOLLOW_UP_CATEGORY_LABELS);

    // keys from a Record<FollowUpCategory, string> should align with FOLLOW_UP_CATEGORIES
    expect(keys).toEqual(FOLLOW_UP_CATEGORIES.slice());
    expect(keys).toHaveLength(FOLLOW_UP_CATEGORIES.length);
  });

  it("uses exact label strings for every category", () => {
    expect(FOLLOW_UP_CATEGORY_LABELS).toEqual({
      vendor_followup: "Vendor follow-up",
      confirm_onsite: "Confirm on-site",
      proposal_followup: "Proposal follow-up",
      general: "General reminder",
    });
  });
});

describe("isFollowUpCategory", () => {
  it("returns true for every known category", () => {
    expect(isFollowUpCategory("vendor_followup")).toBe(true);
    expect(isFollowUpCategory("confirm_onsite")).toBe(true);
    expect(isFollowUpCategory("proposal_followup")).toBe(true);
    expect(isFollowUpCategory("general")).toBe(true);
  });

  it("returns false for an unrecognized string, empty string, and differently-cased values", () => {
    expect(isFollowUpCategory("nope")).toBe(false);
    expect(isFollowUpCategory("")).toBe(false);

    expect(isFollowUpCategory("Vendor_followup")).toBe(false);
    expect(isFollowUpCategory("confirm_On_site")).toBe(false);
  });
});
