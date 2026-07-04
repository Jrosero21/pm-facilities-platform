// Pure label helpers for dispatch facet snapshots — shared by the server-rendered
// dispatch section and the client-side candidate picker (no directive, importable
// by both).
//
// COPY PRECISION (D-5.x): "primary" here means ONLY the vendor's primary TRADE
// specialty (the matcher's primaryTradeMatch / coverage is_primary, R-3.6). It is
// NOT "aggregator-designated primary vendor" — that concept (auto-dispatch routing)
// is unbuilt in Phase 5. So we always say "Primary trade: X", never bare "primary".

export type GeoMatchType = "postal_code" | "city" | "state" | "national";

/** "Primary trade: HVAC" vs "Trade: HVAC (one of their trades)". */
export function tradeMatchLabel(
  tradeName: string,
  primaryTradeMatch: boolean,
): string {
  return primaryTradeMatch
    ? `Primary trade: ${tradeName}`
    : `Trade: ${tradeName} (one of their trades)`;
}

const GEO_LABELS: Record<GeoMatchType, string> = {
  postal_code: "Postal-code service area",
  city: "City service area",
  state: "State service area",
  national: "National service area",
};

export function geoMatchLabel(tightestGeo: string | null): string {
  if (tightestGeo == null) return "Outside service area";
  return GEO_LABELS[tightestGeo as GeoMatchType] ?? tightestGeo;
}

const COMPLIANCE_LABELS: Record<string, string> = {
  ok: "Compliant",
  no_data: "No compliance data",
  expired: "Compliance expired",
  non_compliant: "Non-compliant",
};

export function complianceLabel(status: string): string {
  return COMPLIANCE_LABELS[status] ?? status;
}

/** The compact dot-separated facet line used on cards and candidate rows. */
export function facetLine(args: {
  tradeName: string;
  primaryTradeMatch: boolean;
  // null = out-of-area (no geo match) — the geo segment is dropped; the "Outside service area" badge
  // carries that signal in the picker.
  tightestGeo: string | null;
  compliance: string;
}): string {
  return [
    tradeMatchLabel(args.tradeName, args.primaryTradeMatch),
    args.tightestGeo ? geoMatchLabel(args.tightestGeo) : null,
    complianceLabel(args.compliance),
  ]
    .filter(Boolean)
    .join(" · ");
}
