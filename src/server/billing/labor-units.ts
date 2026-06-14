// ── Time-unit recognizer (pure util) ──────────────────────────────────────────────────
// PURE util — no "use client", no "server-only", no DB/IO (mirrors money.ts / role-gates.ts /
// vendor-invoice-status.ts). The CONSERVATIVE labor auto-fill gate (Phase ii Unit 2b): the invoice
// agent re-prices a rate_sheet labor line to the agreed rate ONLY when the vendor line carries an
// EXPLICIT time unit. Across 20k+ vendors with no uniform format, quantity alone is NOT a trusted
// hours signal (a qty=1 $500 line can hide 10 man-hours), so we never infer hours from a bare count —
// only an explicit time unit fills; everything else stays BLANK for the operator (the SAFE failure: a
// wrong auto-fill bills garbage). Reused by the banked operator-enters-hours affordance.
//
// Recognized (case-insensitive; whitespace / hyphens / periods stripped before matching):
//   hr, hrs, hour, hours  +  the man-hour family (man-hr, man-hrs, man-hour, man-hours).
// So "Hr", "HRS", "hr.", "Hours", "man hr", "man-hours", "manhours" all match; "each", "ea", "lot",
// "lump", "job", "hourly" (a rate type, not a count unit), null/empty do NOT.
const TIME_UNITS: ReadonlySet<string> = new Set([
  "hr", "hrs", "hour", "hours",
  "manhr", "manhrs", "manhour", "manhours",
]);

/** True when `unit` is an explicit recognized time unit (the only signal that auto-fills the agreed
 *  labor rate). null/undefined/empty/non-time → false (operator resolves; vendor cost shown as ref). */
export function isTimeUnit(unit: string | null | undefined): boolean {
  if (unit == null) return false;
  const norm = unit.toLowerCase().trim().replace(/[\s.\-]/g, "");
  return TIME_UNITS.has(norm);
}
