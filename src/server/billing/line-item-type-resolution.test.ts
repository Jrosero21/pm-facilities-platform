import { describe, expect, it } from "vitest";
import {
  resolveLineItemTypes,
  type TenantLineItemTypeRow,
} from "@/server/billing/line-item-type-resolution";
import { BUILT_IN_LINE_ITEM_TYPES } from "@/server/billing/line-item-types";

describe("line-item-type-resolution", () => {
  it("resolveLineItemTypes([]) returns exactly the 8 built-ins in key order", () => {
    const resolved = resolveLineItemTypes([]);
    expect(resolved).toHaveLength(8);
    expect(resolved.map((d) => d.key)).toEqual([
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

  it("tenant row replaces the built-in ENTIRELY for the same key", () => {
    const rows: TenantLineItemTypeRow[] = [
      {
        key: "labor",
        label: "Crew Time",
        pricingModel: "judgment",
        defaultRateType: null,
        displayOrder: 10,
      },
    ];

    const resolved = resolveLineItemTypes(rows);
    const labor = resolved.find((d) => d.key === "labor");
    expect(labor).toBeTruthy();
    expect(labor).toMatchObject({
      key: "labor",
      label: "Crew Time",
      pricingModel: "judgment",
      defaultRateType: null,
    });
  });

  it("custom (non-built-in) rows are appended and sorted by displayOrder then key", () => {
    const rows: TenantLineItemTypeRow[] = [
      {
        key: "subcontract",
        label: "Subcontract",
        pricingModel: "deterministic",
        defaultRateType: "hourly",
        displayOrder: 15,
      },
    ];

    const resolved = resolveLineItemTypes(rows);
    expect(resolved).toHaveLength(9);

    const keysInOrder = resolved.map((d) => d.key);
    // labor has displayOrder 10, materials has 20
    expect(keysInOrder).toContain("subcontract");
    expect(keysInOrder.indexOf("labor")).toBeLessThan(
      keysInOrder.indexOf("subcontract"),
    );
    expect(keysInOrder.indexOf("subcontract")).toBeLessThan(
      keysInOrder.indexOf("materials"),
    );
  });

  it("ties on displayOrder are ordered by key ascending", () => {
    const rows: TenantLineItemTypeRow[] = [
      {
        key: "z_custom",
        label: "Z Custom",
        pricingModel: "judgment",
        defaultRateType: null,
        displayOrder: 10,
      },
      {
        key: "a_custom",
        label: "A Custom",
        pricingModel: "judgment",
        defaultRateType: null,
        displayOrder: 10,
      },
    ];

    const resolved = resolveLineItemTypes(rows);
    const tenOrder = resolved
      .filter((d) => d.displayOrder === 10)
      .map((d) => d.key);

    // Includes the built-in labor (displayOrder 10) plus both custom ties.
    // Keys should be sorted: a_custom, labor, z_custom.
    expect(tenOrder).toEqual(["a_custom", "labor", "z_custom"]);
  });

  it("calling twice does not mutate built-ins", () => {
    const overridingLabor: TenantLineItemTypeRow[] = [
      {
        key: "labor",
        label: "Crew Time",
        pricingModel: "judgment",
        defaultRateType: null,
        displayOrder: 10,
      },
    ];

    const first = resolveLineItemTypes(overridingLabor);
    const firstLabor = first.find((d) => d.key === "labor");
    expect(firstLabor).toMatchObject({
      label: "Crew Time",
      pricingModel: "judgment",
      defaultRateType: null,
    });

    const second = resolveLineItemTypes([]);
    const secondLabor = second.find((d) => d.key === "labor");

    // Should be original built-in labor.
    const builtInLabor = BUILT_IN_LINE_ITEM_TYPES.find((d) => d.key === "labor");
    expect(builtInLabor).toBeTruthy();

    expect(secondLabor).toMatchObject({
      label: "Labor",
      pricingModel: "deterministic",
      defaultRateType: "hourly",
    });

    // Also ensure the module constant was not mutated.
    expect(BUILT_IN_LINE_ITEM_TYPES.find((d) => d.key === "labor")).toEqual(
      builtInLabor,
    );
  });
});
