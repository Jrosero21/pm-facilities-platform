import { describe, expect, it } from "vitest";
import {
  BUILT_IN_LINE_ITEM_TYPE_KEYS,
  BUILT_IN_LINE_ITEM_TYPES,
  defaultRateTypeForCategory,
  findLineItemType,
  isDeterministicCategory,
} from "@/server/billing/line-item-types";

describe("line-item-types", () => {
  it("defaultRateTypeForCategory returns expected built-in defaults", () => {
    expect(defaultRateTypeForCategory("labor")).toBe("hourly");
    expect(defaultRateTypeForCategory("trip")).toBe("trip_charge");

    expect(defaultRateTypeForCategory("subcontract")).toBeNull();
    expect(defaultRateTypeForCategory("")).toBeNull();
  });

  it.each([
    ["materials"],
    ["equipment"],
    ["permit"],
    ["fee"],
    ["tax"],
    ["other"],
  ])("defaultRateTypeForCategory returns null for %s", (category) => {
    expect(defaultRateTypeForCategory(category)).toBeNull();
  });

  it("isDeterministicCategory matches pricingModel", () => {
    expect(isDeterministicCategory("labor")).toBe(true);
    expect(isDeterministicCategory("trip")).toBe(true);

    expect(isDeterministicCategory("subcontract")).toBe(false);
    expect(isDeterministicCategory("")).toBe(false);
  });

  it.each([
    ["materials"],
    ["equipment"],
    ["permit"],
    ["fee"],
    ["tax"],
    ["other"],
  ])("isDeterministicCategory is false for %s", (category) => {
    expect(isDeterministicCategory(category)).toBe(false);
  });

  it("findLineItemType returns expected entries", () => {
    expect(findLineItemType("labor")).toMatchObject({ label: "Labor" });
    expect(findLineItemType("nope")).toBeUndefined();
  });

  it("BUILT_IN_LINE_ITEM_TYPES is structurally valid", () => {
    expect(BUILT_IN_LINE_ITEM_TYPES).toHaveLength(8);

    const keys = BUILT_IN_LINE_ITEM_TYPES.map((d) => d.key);
    expect(keys).toEqual([
      "labor",
      "materials",
      "equipment",
      "trip",
      "permit",
      "fee",
      "tax",
      "other",
    ]);

    const displayOrders = BUILT_IN_LINE_ITEM_TYPES.map((d) => d.displayOrder);
    expect(new Set(displayOrders).size).toBe(displayOrders.length);

    for (let i = 1; i < displayOrders.length; i++) {
      expect(displayOrders[i]).toBeGreaterThan(displayOrders[i - 1]);
    }

    expect(new Set(keys).size).toBe(keys.length);

    const deterministicCount = BUILT_IN_LINE_ITEM_TYPES.filter(
      (d) => d.pricingModel === "deterministic",
    ).length;
    expect(deterministicCount).toBe(2);
  });

  it("BUILT_IN_LINE_ITEM_TYPE_KEYS matches type keys in order", () => {
    expect(BUILT_IN_LINE_ITEM_TYPE_KEYS).toEqual([
      "labor",
      "materials",
      "equipment",
      "trip",
      "permit",
      "fee",
      "tax",
      "other",
    ]);
  });
});
