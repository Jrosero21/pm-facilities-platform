// ── Phase 8 batch 8c.7 — SHARED MONEY/LINE-FIELD VALIDATION (pure util) ───────────────
// PURE util — NO "server-only", NO DB, NO env, NO IO. Just regex shape-validation, so it is
// reusable from any layer (8c.7 Decision 6). Extracted at 8c.7 (Option A) from the inline copies
// that the AR data layers (proposals, change-orders) each carried, so there is now ONE definition
// of the line-field shape contract + ONE set of INVALID_LINE_* error strings, consumed by the AR
// modules and the new AP module (vendor-invoices).
//
// maxIntDigits = precision − scale. Inputs are pre-canonical decimal text ("d.dd…") and are
// non-negative (money / quantity / percentages are >= 0). markup_percent is AR-only and is NOT
// part of this shared base — it stays inline in the AR modules.

/** True iff `s` is non-negative decimal text within `maxIntDigits` integer digits and `scale` dp. */
export function isDecimalStr(s: string, maxIntDigits: number, scale: number): boolean {
  const re = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(s)) return false;
  const intPart = (s.split(".")[0] ?? "").replace(/^0+(?=\d)/, "");
  if (intPart.length > maxIntDigits) return false;
  return parseFloat(s) >= 0; // money/qty/pct are non-negative
}

// The four fields shared by every line-item table (AR + AP). markup_percent is deliberately absent.
type CommonLineFields = {
  quantity?: string;
  unitPrice?: string;
  taxRate?: string | null;
  taxAmount?: string;
};

/** Assert the four shared line fields; throws the generic INVALID_LINE_* contract errors.
 *  Error strings are part of the contract — kept verbatim from the pre-8c.7 inline validators. */
export function assertCommonLineFields(f: CommonLineFields): void {
  if (f.quantity !== undefined && !isDecimalStr(f.quantity, 8, 2)) throw new Error("INVALID_LINE_QUANTITY");
  if (f.unitPrice !== undefined && !isDecimalStr(f.unitPrice, 10, 2)) throw new Error("INVALID_LINE_UNIT_PRICE");
  if (f.taxAmount !== undefined && !isDecimalStr(f.taxAmount, 12, 2)) throw new Error("INVALID_LINE_TAX_AMOUNT");
  if (f.taxRate != null && !isDecimalStr(f.taxRate, 3, 3)) throw new Error("INVALID_LINE_TAX_RATE");
}

// 8c.4 / 9b: canonicalize an operator-entered NTE to a "d.dd" decimal(12,2) string, or null if
// invalid. Validates shape, strips leading zeros, pads decimals, requires > 0 and ≤10 integer
// digits. createJob compares this canonical form === the resolver's canonical amount (no money lib
// in the data layer — 9a), so canonicalization MUST happen at the action boundary.
//
// RELOCATED (v2.11.0) from jobs/actions.ts: it had to leave that file because exporting it for
// updateJobAction broke the "use server" rule (every export of a Server-Action module must be an
// async function). Logic is BYTE-IDENTICAL — createJob's NTE behavior + the harness are unchanged.
export function canonicalizeNte(raw: string): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [intRaw, decRaw = ""] = raw.split(".");
  const intPart = intRaw.replace(/^0+(?=\d)/, "");
  if (intPart.length > 10) return null; // decimal(12,2) overflow
  const canonical = `${intPart}.${(decRaw + "00").slice(0, 2)}`;
  return parseFloat(canonical) > 0 ? canonical : null;
}
