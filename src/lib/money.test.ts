import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";

describe("formatMoney", () => {
  it.each([
    ["1234.56", "$1,234.56"],
    ["0.00", "$0.00"],
    ["12345.60", "$12,345.60"],
    ["-1234.56", "-$1,234.56"],
    ["1000000", "$1,000,000.00"],
    ["1234.5", "$1,234.50"],
    ["1234", "$1,234.00"],
    ["999999999.99", "$999,999,999.99"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  // Ties must round AWAY FROM ZERO. big.js mode 2 is roundHalfEven, not half-up —
  // that shipped once and only a tie case can catch it.
  it.each([
    ["1234.567", "$1,234.57"],
    ["0.005", "$0.01"],
    ["1.005", "$1.01"],
    ["1234.565", "$1,234.57"],
    ["2.675", "$2.68"],
    ["-0.005", "-$0.01"],
  ])("rounds %s half-up to %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it.each([["-0.001"], ["-0.004"], ["-0"]])("never renders a negative sign for %s, which rounds to zero", (input) => {
    expect(formatMoney(input)).toBe("$0.00");
  });

  it.each([[null], [undefined], [""], ["   "]])("renders the em dash for %s", (input) => {
    expect(formatMoney(input as string | null | undefined)).toBe("—");
  });

  it.each([["abc"], ["1e3"], ["+1.00"], [".5"], ["1,234.56"], ["NaN"], ["Infinity"]])(
    "throws TypeError rather than rendering NaN for %s",
    (input) => {
      expect(() => formatMoney(input)).toThrow(TypeError);
    },
  );
});
