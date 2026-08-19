// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO.
// Percent/ratio formatting helpers using Big.js for never-float arithmetic.

import Big from "big.js";

const EM_DASH = "—";

// Strict decimal validation: optional leading '-', digits, optional fractional part.
// Rejects whitespace-only (handled separately), and rejects non-decimal like "abc".
const DECIMAL_RE = /^-?(?:\d+)(?:\.\d+)?$/;

/**
 * Formats a stored PostgreSQL numeric percent value (Drizzle returns string) for display.
 * Strips insignificant trailing zeros after the decimal point.
 */
export function formatPercentValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;

  const raw = value.trim();
  if (!raw) return EM_DASH;

  if (!DECIMAL_RE.test(raw)) {
    throw new TypeError(`Invalid decimal string: ${JSON.stringify(value)}`);
  }

  // Parse and keep exact decimal semantics.
  const num = new Big(raw);

  // For display we want to drop trailing zeros; toFixed(2) would force decimals,
  // while toString() preserves exponent forms. Use toFixed(2) when there are
  // exactly two fractional digits, else preserve as provided.
  // However, we can reliably normalize by using Big's decimalPlaces after rounding.
  // Since the DB percent is numeric(?,2), the inputs in this repo are expected
  // to have at most two decimals.
  const asTwoPlaces = num.round(2, Big.roundHalfUp);
  const fixed2 = asTwoPlaces.abs().toFixed(2); // always 2 decimals

  // Strip trailing zeros in the fractional part.
  const [intPart, fracPart] = fixed2.split(".");
  const trimmedFrac = fracPart.replace(/0+$/, "");

  const sign = asTwoPlaces.lt(0) ? "-" : "";
  if (trimmedFrac.length === 0) {
    return `${sign}${intPart}%`;
  }
  return `${sign}${intPart}.${trimmedFrac}%`;
}

/**
 * Formats a 0-to-1 ratio as a percent string, multiplying by 100.
 * Renders exactly `decimals` places (default 0), keeping trailing zeros.
 */
export function formatRatioAsPercent(ratio: number | null | undefined, decimals: number = 0): string {
  if (ratio === null || ratio === undefined) return EM_DASH;

  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError(`decimals must be a non-negative integer, got: ${decimals}`);
  }

  // Convert ratio to Big via string to avoid float arithmetic.
  // String(ratio) is acceptable for typical JS literals used in this repo/tests.
  const ratioBig = new Big(String(ratio));
  const percent = ratioBig.times(100);

  const rounded = percent.round(decimals, Big.roundHalfUp);

  const fixed = rounded.toFixed(decimals); // keeps trailing zeros
  return `${fixed}%`;
}
