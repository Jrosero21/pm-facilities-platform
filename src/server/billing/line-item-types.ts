// PURE shared module — NO "server-only", NO DB/env/IO. Line-item category definitions
// moved from code into data.

import type { RateType } from "@/server/billing/client-rates";

export type LineItemPricingModel = "deterministic" | "judgment";

export type LineItemTypeDefinition = {
  key: string;
  label: string;
  pricingModel: LineItemPricingModel;
  defaultRateType: RateType | null;
  displayOrder: number;
};

export const BUILT_IN_LINE_ITEM_TYPES = [
  {
    key: "labor",
    label: "Labor",
    pricingModel: "deterministic" satisfies LineItemPricingModel,
    defaultRateType: "hourly" satisfies RateType,
    displayOrder: 10,
  },
  {
    key: "materials",
    label: "Materials",
    pricingModel: "judgment" satisfies LineItemPricingModel,
    defaultRateType: null,
    displayOrder: 20,
  },
  {
    key: "equipment",
    label: "Equipment",
    pricingModel: "judgment" satisfies LineItemPricingModel,
    defaultRateType: null,
    displayOrder: 30,
  },
  {
    key: "trip",
    label: "Trip",
    pricingModel: "deterministic" satisfies LineItemPricingModel,
    defaultRateType: "trip_charge" satisfies RateType,
    displayOrder: 40,
  },
  {
    key: "permit",
    label: "Permit",
    pricingModel: "judgment" satisfies LineItemPricingModel,
    defaultRateType: null,
    displayOrder: 50,
  },
  {
    key: "fee",
    label: "Fee",
    pricingModel: "judgment" satisfies LineItemPricingModel,
    defaultRateType: null,
    displayOrder: 60,
  },
  {
    key: "tax",
    label: "Tax",
    pricingModel: "judgment" satisfies LineItemPricingModel,
    defaultRateType: null,
    displayOrder: 70,
  },
  {
    key: "other",
    label: "Other",
    pricingModel: "judgment" satisfies LineItemPricingModel,
    defaultRateType: null,
    displayOrder: 80,
  },
] as const satisfies readonly LineItemTypeDefinition[];

export const BUILT_IN_LINE_ITEM_TYPE_KEYS = [
  "labor",
  "materials",
  "equipment",
  "trip",
  "permit",
  "fee",
  "tax",
  "other",
] as const;

export function findLineItemType(key: string): LineItemTypeDefinition | undefined {
  return BUILT_IN_LINE_ITEM_TYPES.find((d) => d.key === key);
}

export function defaultRateTypeForCategory(category: string): RateType | null {
  const def = findLineItemType(category);
  return def ? def.defaultRateType : null;
}

export function isDeterministicCategory(category: string): boolean {
  const def = findLineItemType(category);
  return def ? def.pricingModel === "deterministic" : false;
}
