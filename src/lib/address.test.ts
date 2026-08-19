import { describe, expect, it } from "vitest";
import { type AddressParts, formatAddressLines, formatAddressOneLine } from "@/lib/address";

const parts = (
  addressLine1: string | null,
  addressLine2: string | null,
  city: string | null,
  stateProvince: string | null,
  postalCode: string | null,
): AddressParts => ({ addressLine1, addressLine2, city, stateProvince, postalCode });

describe("formatAddressLines", () => {
  it("keeps every present field, city/state/postal on the last line", () => {
    expect(formatAddressLines(parts("123 Main St", "Suite 400", "Bellport", "NY", "11713"))).toEqual([
      "123 Main St",
      "Suite 400",
      "Bellport, NY 11713",
    ]);
  });

  it.each([
    [parts("123 Main St", null, "Bellport", "NY", "11713"), ["123 Main St", "Bellport, NY 11713"]],
    [parts(null, null, "Bellport", null, null), ["Bellport"]],
    [parts(null, null, null, "NY", "11713"), ["NY 11713"]],
    [parts(null, null, "Bellport", null, "11713"), ["Bellport 11713"]],
    [parts(null, null, "Bellport", "NY", null), ["Bellport, NY"]],
    [parts(null, null, null, "NY", null), ["NY"]],
    [parts(null, "Suite 400", null, null, null), ["Suite 400"]],
  ])("skips the missing fields (%#)", (input, expected) => {
    expect(formatAddressLines(input)).toEqual(expected);
  });

  it("trims whitespace and drops fields that trim to empty", () => {
    expect(formatAddressLines(parts("  123 Main St  ", null, "  Bellport ", "NY", "11713"))).toEqual([
      "123 Main St",
      "Bellport, NY 11713",
    ]);
    expect(formatAddressLines(parts("", "   ", null, null, null))).toEqual([]);
  });

  it("returns an empty array when nothing is set", () => {
    expect(formatAddressLines(parts(null, null, null, null, null))).toEqual([]);
  });
});

describe("formatAddressOneLine", () => {
  it("joins the same lines with a comma", () => {
    expect(formatAddressOneLine(parts("123 Main St", "Suite 400", "Bellport", "NY", "11713"))).toBe(
      "123 Main St, Suite 400, Bellport, NY 11713",
    );
  });

  it("is the empty string when nothing is set", () => {
    expect(formatAddressOneLine(parts(null, null, null, null, null))).toBe("");
  });
});
