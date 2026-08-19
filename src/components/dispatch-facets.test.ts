import { describe, expect, it } from "vitest";

import {
  complianceLabel,
  facetLine,
  GeoMatchType,
  geoMatchLabel,
  tradeMatchLabel,
} from "./dispatch-facets";

describe("tradeMatchLabel", () => {
  it("returns 'Primary trade: X' when primaryTradeMatch is true", () => {
    expect(tradeMatchLabel("HVAC", true)).toBe("Primary trade: HVAC");
  });

  it("returns 'Trade: X (one of their trades)' when primaryTradeMatch is false", () => {
    expect(tradeMatchLabel("Plumbing", false)).toBe(
      "Trade: Plumbing (one of their trades)",
    );
  });

  it("does not special-case the tradeName string (empty string is preserved)", () => {
    expect(tradeMatchLabel("", true)).toBe("Primary trade: ");
    expect(tradeMatchLabel("", false)).toBe(
      "Trade:  (one of their trades)",
    );
  });
});

describe("geoMatchLabel", () => {
  it("returns 'Outside service area' when tightestGeo is null", () => {
    expect(geoMatchLabel(null)).toBe("Outside service area");
  });

  it("maps every GeoMatchType to its operator-facing label", () => {
    const postal: GeoMatchType = "postal_code";
    const city: GeoMatchType = "city";
    const state: GeoMatchType = "state";
    const national: GeoMatchType = "national";

    expect(geoMatchLabel(postal)).toBe("Postal-code service area");
    expect(geoMatchLabel(city)).toBe("City service area");
    expect(geoMatchLabel(state)).toBe("State service area");
    expect(geoMatchLabel(national)).toBe("National service area");
  });

  it("falls back to the raw string when it is unrecognised", () => {
    expect(geoMatchLabel("zipcode_999" as GeoMatchType)).toBe(
      "zipcode_999",
    );
  });

  it("preserves empty string (not null) via fallback", () => {
    expect(geoMatchLabel("")).toBe("");
  });
});

describe("complianceLabel", () => {
  it("maps every known compliance status to its operator-facing label", () => {
    expect(complianceLabel("ok")).toBe("Compliant");
    expect(complianceLabel("no_data")).toBe("No compliance data");
    expect(complianceLabel("expired")).toBe("Compliance expired");
    expect(complianceLabel("non_compliant")).toBe("Non-compliant");
  });

  it("falls back to the raw status string when unrecognised", () => {
    expect(complianceLabel("something_else")).toBe("something_else");
  });

  it("preserves empty string via fallback", () => {
    expect(complianceLabel("")).toBe("");
  });
});

describe("facetLine", () => {
  it("composes trade, optional geo, and compliance with dot separators in the correct order (representative case)", () => {
    const line = facetLine({
      tradeName: "HVAC",
      primaryTradeMatch: true,
      tightestGeo: "state",
      compliance: "ok",
    });

    expect(line).toBe(
      [
        "Primary trade: HVAC",
        "State service area",
        "Compliant",
      ].join(" · "),
    );
  });

  it("drops the geo segment when tightestGeo is absent (null) and keeps ordering/separators", () => {
    const line = facetLine({
      tradeName: "Plumbing",
      primaryTradeMatch: false,
      tightestGeo: null,
      compliance: "no_data",
    });

    expect(line).toBe(
      [
        "Trade: Plumbing (one of their trades)",
        "No compliance data",
      ].join(" · "),
    );
  });

  it("when tightestGeo is an empty string, it is treated as absent (geo segment dropped)", () => {
    const line = facetLine({
      tradeName: "Electrical",
      primaryTradeMatch: true,
      tightestGeo: "",
      compliance: "expired",
    });

    expect(line).toBe(["Primary trade: Electrical", "Compliance expired"].join(" · "));
  });

  it("uses geoMatchLabel/complianceLabel fallback values when inputs are unrecognised", () => {
    const line = facetLine({
      tradeName: "HVAC",
      primaryTradeMatch: true,
      tightestGeo: "zipcode_999" as unknown as GeoMatchType,
      compliance: "weird_status",
    });

    // geoMatchLabel falls back to the raw string; complianceLabel falls back to raw.
    expect(line).toBe(
      ["Primary trade: HVAC", "zipcode_999", "weird_status"].join(" · "),
    );
  });
});
