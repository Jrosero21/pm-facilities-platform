import { describe, expect, it } from "vitest";

import {
  STATUS_CATEGORY_BADGE,
  URGENCY_TIER_BADGE,
  statusCategoryBadge,
  tierBadge,
} from "./tier-colors";

describe("tier-colors characterization", () => {
  it("exports exact URGENCY_TIER_BADGE key/value pairs", () => {
    expect(URGENCY_TIER_BADGE).toStrictEqual({
      stalled: "bg-red-100 text-red-700",
      overdue: "bg-amber-100 text-amber-800",
      "unassigned-high-priority": "bg-amber-100 text-amber-800",
      aged: "bg-neutral-100 text-neutral-700",
    });
  });

  it("exports exact STATUS_CATEGORY_BADGE key/value pairs", () => {
    expect(STATUS_CATEGORY_BADGE).toStrictEqual({
      open: "bg-neutral-100 text-neutral-700",
      in_progress: "bg-blue-100 text-blue-800",
      on_hold: "bg-amber-100 text-amber-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-700",
    });
  });

  describe("tierBadge(tier)", () => {
    it("returns the mapped badge classes for a representative key", () => {
      expect(tierBadge("overdue")).toBe("bg-amber-100 text-amber-800");
    });

    it("returns the mapped badge classes for an edge/other defined key", () => {
      expect(tierBadge("unassigned-high-priority")).toBe(
        "bg-amber-100 text-amber-800",
      );
    });

    it("falls back for an unknown tier key", () => {
      expect(tierBadge("__not_a_real_tier__")).toBe(
        "bg-neutral-100 text-neutral-700",
      );
    });

    it("falls back for the empty string tier", () => {
      expect(tierBadge("")).toBe("bg-neutral-100 text-neutral-700");
    });
  });

  describe("statusCategoryBadge(category)", () => {
    it("returns the mapped badge classes for a representative key", () => {
      expect(statusCategoryBadge("in_progress")).toBe(
        "bg-blue-100 text-blue-800",
      );
    });

    it("returns the mapped badge classes for an edge/other defined key", () => {
      expect(statusCategoryBadge("on_hold")).toBe(
        "bg-amber-100 text-amber-800",
      );
    });

    it("falls back for an unknown status category key", () => {
      expect(statusCategoryBadge("__not_a_real_category__")).toBe(
        "bg-neutral-100 text-neutral-700",
      );
    });

    it("falls back for the empty string category", () => {
      expect(statusCategoryBadge("")).toBe("bg-neutral-100 text-neutral-700");
    });
  });
});
