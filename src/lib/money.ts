// PURE shared module — NO "server-only", NO "use client", NO DB/env/IO. Money formatter
// for displaying PostgreSQL numeric(12,2) values that Drizzle returns as strings.

import Big from "big.js";

const EM_DASH = "—";

// Strict decimal validation: optional leading '-', digits, optional fractional part.
// Rejects whitespace-only (handled separately), and rejects non-decimal like "abc".
const DECIMAL_RE = /^-?(?:\d+)(?:\.\d+)?$/;

/** Formats a PostgreSQL numeric(12,2) value for display, or em dash for null/undefined/blank. */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;

  const raw = value.trim();
  if (!raw) return EM_DASH;

  if (!DECIMAL_RE.test(raw)) throw new TypeError(`Invalid decimal string: ${JSON.stringify(value)}`);

  // Use Big for parsing and rounding to two decimals.
  const num = new Big(raw);

  // big.js rounding mode for HALF_UP uses the named constant.
  // Ties round away from zero.
  const rounded = num.round(2, Big.roundHalfUp);

  // Never render a negative sign for values that round to zero.
  if (rounded.eq(0)) {
    return "$0.00";
  }

  const sign = rounded.lt(0) ? "-" : "";
  const abs = rounded.abs();

  // Build formatted string without float arithmetic.
  const fixed = abs.toFixed(2); // always exactly 2 decimals
  const [intPart, fracPart] = fixed.split(".");

  // Insert thousands separators.
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${sign}$${withCommas}.${fracPart}`;
}
