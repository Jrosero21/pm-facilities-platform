import { describe, expect, it } from "vitest";
import type { RateType } from "@/server/billing/client-rates";

import {
  defaultRateTypeIn,
  findTypeIn,
  isDeterministicIn,
  isKnownCategory,
  labelForKey,
  optionsFor,
} from "@/server/billing/line-item-type-lookup";

const listFixture = [
  {
    key: "other",
    label: "Other",
    pricingModel: "judgment",
    defaultRateType: null,
    displayOrder: 80,
  },
  {
    key: "labor",
    label: "Crew Time",
    pricingModel: "deterministic",
    defaultRateType: "hourly" as RateType,
    displayOrder: 10,
  },
] as const;

describe("line-item-type-lookup", () => {
  it("optionsFor preserves order", () => {
    expect(optionsFor(listFixture)).toEqual([
      { value: "other", label: "Other" },
      { value: "labor", label: "Crew Time" },
    ]);
  });

  it("isDeterministicIn matches pricingModel", () => {
    expect(isDeterministicIn(listFixture, "labor")).toBe(true);
    expect(isDeterministicIn(listFixture, "other")).toBe(false);
    expect(isDeterministicIn(listFixture, "subcontract")).toBe(false);
  });

  it("defaultRateTypeIn returns defaults from the provided list", () => {
    expect(defaultRateTypeIn(listFixture, "labor")).toBe("hourly");
    expect(defaultRateTypeIn(listFixture, "other")).toBeNull();
    expect(defaultRateTypeIn(listFixture, "subcontract")).toBeNull();
  });

  it("labelForKey uses the provided list label (and falls back to key)", () => {
    expect(labelForKey(listFixture, "labor")).toBe("Crew Time");
    expect(labelForKey(listFixture, "subcontract")).toBe("subcontract");
    expect(labelForKey(listFixture, "")).toBe("");
  });

  it("isKnownCategory returns false for unknown/empty keys", () => {
    expect(isKnownCategory(listFixture, "")).toBe(false);
    expect(isKnownCategory(listFixture, "subcontract")).toBe(false);
  });

  it("optionsFor([]) returns []", () => {
    expect(optionsFor([])).toEqual([]);
  });

  it("findTypeIn returns found type or undefined", () => {
    expect(findTypeIn(listFixture, "labor")).toMatchObject({
      key: "labor",
      label: "Crew Time",
    });
    expect(findTypeIn(listFixture, "nope")).toBeUndefined();
  });
});
