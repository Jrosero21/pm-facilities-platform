// PURE module — NO "server-only", NO DB/env/IO.
// Resolves a tenant’s stored line-item type rows over built-in defaults.

import type { RateType } from "@/server/billing/client-rates";
import {
  BUILT_IN_LINE_ITEM_TYPES,
  type LineItemPricingModel,
  type LineItemTypeDefinition,
} from "@/server/billing/line-item-types";

export type TenantLineItemTypeRow = {
  key: string;
  label: string;
  pricingModel: LineItemPricingModel;
  defaultRateType: RateType | null;
  displayOrder: number;
};

function sortResolvedLineItemTypes(
  types: readonly LineItemTypeDefinition[],
): LineItemTypeDefinition[] {
  return [...types].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.key.localeCompare(b.key);
  });
}

export function resolveLineItemTypes(
  rows: readonly TenantLineItemTypeRow[],
): LineItemTypeDefinition[] {
  // Built-in defaults are authoritative only when the tenant provides no row.
  // Typed as <string, ...> deliberately: BUILT_IN_LINE_ITEM_TYPES is `as const`,
  // so an inferred Map key would be the eight literals and reject any other key.
  const builtInByKey = new Map<string, LineItemTypeDefinition>(
    BUILT_IN_LINE_ITEM_TYPES.map((d) => [d.key, d]),
  );

  const resolved: LineItemTypeDefinition[] = [];
  const seenCustomKeys = new Set<string>();

  for (const row of rows) {
    const builtIn = builtInByKey.get(row.key);
    if (builtIn) {
      // Replace the built-in ENTIRELY when a tenant overrides it.
      resolved.push({
        key: row.key,
        label: row.label,
        pricingModel: row.pricingModel,
        defaultRateType: row.defaultRateType,
        displayOrder: row.displayOrder,
      });
    } else {
      // Append unknown keys as custom types.
      if (!seenCustomKeys.has(row.key)) {
        resolved.push({
          key: row.key,
          label: row.label,
          pricingModel: row.pricingModel,
          defaultRateType: row.defaultRateType,
          displayOrder: row.displayOrder,
        });
        seenCustomKeys.add(row.key);
      }
    }
  }

  // Add built-ins that were not overridden.
  for (const builtIn of BUILT_IN_LINE_ITEM_TYPES) {
    const overridden = rows.some((r) => r.key === builtIn.key);
    if (!overridden) resolved.push({ ...builtIn });
  }

  return sortResolvedLineItemTypes(resolved);
}
