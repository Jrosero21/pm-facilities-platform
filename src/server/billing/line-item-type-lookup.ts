import type { RateType } from "@/server/billing/client-rates";

import type {
  LineItemTypeDefinition,
} from "@/server/billing/line-item-types";

// NOTE: This module is PURE: it does not read DB/env/IO.
// It answers lookup questions against a caller-supplied list of types.

export function findTypeIn(
  types: readonly LineItemTypeDefinition[],
  key: string,
): LineItemTypeDefinition | undefined {
  return types.find((d) => d.key === key);
}

export function isKnownCategory(
  types: readonly LineItemTypeDefinition[],
  key: string,
): boolean {
  return findTypeIn(types, key) !== undefined;
}

export function isDeterministicIn(
  types: readonly LineItemTypeDefinition[],
  key: string,
): boolean {
  const found = findTypeIn(types, key);
  return found ? found.pricingModel === "deterministic" : false;
}

export function defaultRateTypeIn(
  types: readonly LineItemTypeDefinition[],
  key: string,
): RateType | null {
  const found = findTypeIn(types, key);
  return found ? found.defaultRateType : null;
}

export function labelForKey(
  types: readonly LineItemTypeDefinition[],
  key: string,
): string {
  const found = findTypeIn(types, key);
  return found ? found.label : key;
}

export function optionsFor(
  types: readonly LineItemTypeDefinition[],
): { value: string; label: string }[] {
  return types.map((t) => ({ value: t.key, label: t.label }));
}
