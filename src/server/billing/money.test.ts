import { describe, expect, it } from "vitest";

import {
  assertCommonLineFields,
  canonicalizeNte,
  isDecimalStr,
} from "./money";

describe("isDecimalStr", () => {
  it("accepts representative non-negative decimals within maxIntDigits and scale", () => {
    // quantity: maxIntDigits=8 scale=2
    expect(isDecimalStr("123.45", 8, 2)).toBe(true);
    // unitPrice: maxIntDigits=10 scale=2
    expect(isDecimalStr("0.00", 10, 2)).toBe(true);
  });

  it("rejects empty, whitespace, negative, and non-numeric strings (regex + parseFloat check)", () => {
    // Empty string fails the ^\d+... regex
    expect(isDecimalStr("", 8, 2)).toBe(false);
    // Whitespace fails the regex
    expect(isDecimalStr(" 1.23", 8, 2)).toBe(false);
    // Negative sign fails the regex
    expect(isDecimalStr("-1.00", 8, 2)).toBe(false);
    // Non-numeric fails the regex
    expect(isDecimalStr("abc", 8, 2)).toBe(false);
  });

  it("pins scale boundary: allows exactly scale dp, rejects one digit past scale", () => {
    // scale=2
    expect(isDecimalStr("1.23", 8, 2)).toBe(true);
    // one digit past scale
    expect(isDecimalStr("1.234", 8, 2)).toBe(false);
  });

  it("throws when scale=0 because the module generates an invalid RegExp", () => {
    // The module constructs: new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`)
    // With scale=0 this becomes an invalid quantifier {1,0}.
    expect(() => isDecimalStr("0", 8, 0)).toThrow(
      "Invalid regular expression: /^\\d+(\\.\\d{1,0})?$/: numbers out of order in {} quantifier"
    );
  });

  it("pins maxIntDigits boundary: allows exactly maxIntDigits integer digits, rejects one digit past", () => {
    // maxIntDigits=3 scale=2
    expect(isDecimalStr("999.00", 3, 2)).toBe(true);
    expect(isDecimalStr("1000.00", 3, 2)).toBe(false);
  });
});

describe("assertCommonLineFields", () => {
  it("does not throw for a fully valid set of common fields", () => {
    expect(() =>
      assertCommonLineFields({
        quantity: "12.34", // (8,2)
        unitPrice: "1234567890.12", // (10,2)
        taxAmount: "987654321012.34", // (12,2)
        taxRate: "0.123", // (3,3)
      })
    ).not.toThrow();
  });

  it("throws INVALID_LINE_QUANTITY when quantity is invalid for (8,2)", () => {
    // one digit past scale
    expect(() => assertCommonLineFields({ quantity: "1.234" })).toThrow(
      "INVALID_LINE_QUANTITY"
    );
    // one digit past max integer digits (int part: 9 digits)
    expect(() => assertCommonLineFields({ quantity: "100000000.00" })).toThrow(
      "INVALID_LINE_QUANTITY"
    );
  });

  it("throws INVALID_LINE_UNIT_PRICE when unitPrice is invalid for (10,2)", () => {
    expect(() => assertCommonLineFields({ unitPrice: "1.234" })).toThrow(
      "INVALID_LINE_UNIT_PRICE"
    );
    expect(() =>
      assertCommonLineFields({ unitPrice: "10000000000.00" })
    ).toThrow("INVALID_LINE_UNIT_PRICE");
  });

  it("throws INVALID_LINE_TAX_AMOUNT when taxAmount is invalid for (12,2)", () => {
    expect(() => assertCommonLineFields({ taxAmount: "1.234" })).toThrow(
      "INVALID_LINE_TAX_AMOUNT"
    );
    expect(() =>
      assertCommonLineFields({ taxAmount: "1000000000000.00" })
    ).toThrow("INVALID_LINE_TAX_AMOUNT");
  });

  it("throws INVALID_LINE_TAX_RATE when taxRate is invalid for (3,3), and accepts null as 'not present'", () => {
    // null skips validation entirely
    expect(() => assertCommonLineFields({ taxRate: null })).not.toThrow();

    // one digit past scale for taxRate (3 dp)
    expect(() => assertCommonLineFields({ taxRate: "0.1234" })).toThrow(
      "INVALID_LINE_TAX_RATE"
    );
    // one digit past max integer digits for taxRate
    expect(() =>
      assertCommonLineFields({ taxRate: "1000.000" })
    ).toThrow("INVALID_LINE_TAX_RATE");
  });

  it("does not throw when fields are omitted", () => {
    expect(() => assertCommonLineFields({})).not.toThrow();
  });
});

describe("canonicalizeNte", () => {
  it("canonicalizes representative input by stripping leading zeros and padding decimals to 2 places", () => {
    // raw: 001.2 => intPart becomes "1"; decRaw "2" => padded "20" => canonical "1.20"
    expect(canonicalizeNte("001.2")).toBe("1.20");
    // raw: 0.01 stays "0.01" and is > 0 => non-null
    expect(canonicalizeNte("0.01")).toBe("0.01");
    // raw: 12 => "12.00" canonical
    expect(canonicalizeNte("12")).toBe("12.00");
  });

  it("returns null for invalid shapes (regex) including empty, whitespace, negatives, and too many decimal places", () => {
    expect(canonicalizeNte("")).toBeNull();
    expect(canonicalizeNte(" 1.23")).toBeNull();
    expect(canonicalizeNte("-1.00")).toBeNull();
    expect(canonicalizeNte("abc")).toBeNull();
    // regex allows only 1-2 dp
    expect(canonicalizeNte("1.234")).toBeNull();
  });

  it("pins integer-digit boundary (<=10 allowed, 11 digits rejected) based on decimal(12,2) overflow rule", () => {
    expect(canonicalizeNte("9999999999.99")).toBe("9999999999.99"); // 10 integer digits
    expect(canonicalizeNte("10000000000.00")).toBeNull(); // 11 integer digits
  });

  it("returns null for values that canonicalize to 0 or are otherwise not > 0", () => {
    expect(canonicalizeNte("0")).toBeNull();
    expect(canonicalizeNte("0.00")).toBeNull();
    expect(canonicalizeNte("00.000")).toBeNull();
  });
});
