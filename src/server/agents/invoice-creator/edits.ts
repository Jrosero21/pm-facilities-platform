import { isDecimalStr } from "@/server/billing/money";
import { lineItemCategoryEnum } from "@/server/schema/billing-shared";
import type { RateType } from "@/server/billing/client-rates";
import type { ProposedInvoice, ProposedInvoiceLine } from "./drafts";

// ── Phase 26 batch 2b-i — edited-invoice resolution (pure, no DB) ──────────────────────
// The approve-path logic, extracted as a pure function so it's testable without a request
// session (the action is a thin wrapper). Parses the editor's serialized JSON, VALIDATES
// (≥1 line, each with a non-empty description, a valid category, and well-formed decimal
// quantity/unit_price), and computes editedContent NULL-IF-UNCHANGED vs the draft's
// proposed_invoice across the full line shape — mirroring scope-generator/edits.ts.
//
// D4 (money correction is a HUMAN affordance): the operator's edited NUMBERS are ACCEPTED
// here — we validate they are well-formed decimal strings, we do NOT reject them for
// differing from the AI/vendor figure. The AI cannot generate a number (D1); the operator
// can correct one, and that correction is the gold signal banked at the review gate.

type Category = ProposedInvoiceLine["category"];
function normCategory(c: unknown): Category | null {
  return typeof c === "string" && (lineItemCategoryEnum as readonly string[]).includes(c)
    ? (c as Category)
    : null;
}

// Phase (ii) Unit 2b — accept only valid rate_type provenance from the editor's submitted JSON
// (mirrors the client_rates enum). A type-only RateType import keeps this module DB-free / pure.
const RATE_TYPES: readonly string[] = ["hourly", "flat", "trip_charge", "per_unit", "emergency", "after_hours"];
function normRateType(v: unknown): RateType | undefined {
  return typeof v === "string" && RATE_TYPES.includes(v) ? (v as RateType) : undefined;
}

export type InvoiceEditResolution =
  | { ok: true; editedContent: ProposedInvoice | null }
  | { ok: false; error: "MALFORMED_INVOICE" | "INVOICE_REQUIRES_LINES" | "INVALID_LINE_NUMBERS" };

// money decimal shapes (match the billing line-item column precisions): quantity decimal(10,2)
// ⇒ maxIntDigits 8; unit_price decimal(12,2) ⇒ maxIntDigits 10; markup_percent decimal(6,3)
// ⇒ maxIntDigits 3, scale 3.
function validNumbers(ln: ProposedInvoiceLine): boolean {
  if (!isDecimalStr(ln.quantity, 8, 2)) return false;
  if (!isDecimalStr(ln.unitPrice, 10, 2)) return false;
  if (ln.markupPercent != null && !isDecimalStr(ln.markupPercent, 3, 3)) return false;
  return true;
}

// Normalize one editor line: trim description, coerce category, keep number fields as strings
// (string|"" when absent — validation then rejects). unit/markupPercent/reconciliation
// preserved (null-normalized for a fair compare).
function normalizeLine(raw: unknown): ProposedInvoiceLine {
  const r = (raw ?? {}) as {
    category?: unknown;
    description?: unknown;
    quantity?: unknown;
    unit?: unknown;
    unitPrice?: unknown;
    markupPercent?: unknown;
    reconcilesToVendorLineId?: unknown;
    tradeId?: unknown;
    rateType?: unknown;
  };
  return {
    category: normCategory(r.category) ?? ("" as Category),
    description: typeof r.description === "string" ? r.description.trim() : "",
    quantity: typeof r.quantity === "string" ? r.quantity : "",
    unit: typeof r.unit === "string" ? r.unit : null,
    unitPrice: typeof r.unitPrice === "string" ? r.unitPrice : "",
    markupPercent: typeof r.markupPercent === "string" ? r.markupPercent : null,
    reconcilesToVendorLineId:
      typeof r.reconcilesToVendorLineId === "string" ? r.reconcilesToVendorLineId : null,
    // Phase (ii) Unit 2b — agreed-rate provenance the editor kept (price unchanged). Absent ⇒ null
    // tradeId / undefined rateType (no provenance; publish bills the line with normal markup logic).
    tradeId: typeof r.tradeId === "string" ? r.tradeId : null,
    rateType: normRateType(r.rateType),
  };
}

function linesEqual(a: ProposedInvoiceLine, b: ProposedInvoiceLine): boolean {
  return (
    a.category === b.category &&
    a.description === b.description &&
    a.quantity === b.quantity &&
    (a.unit ?? null) === (b.unit ?? null) &&
    a.unitPrice === b.unitPrice &&
    (a.markupPercent ?? null) === (b.markupPercent ?? null) &&
    (a.reconcilesToVendorLineId ?? null) === (b.reconcilesToVendorLineId ?? null) &&
    (a.tradeId ?? null) === (b.tradeId ?? null) &&
    (a.rateType ?? null) === (b.rateType ?? null)
  );
}

function invoiceEqual(a: ProposedInvoice, b: ProposedInvoice): boolean {
  if (a.lineItems.length !== b.lineItems.length) return false;
  if ((a.lumpFlag ?? false) !== (b.lumpFlag ?? false)) return false;
  if ((a.notes ?? "") !== (b.notes ?? "")) return false;
  return a.lineItems.every((ln, i) => linesEqual(ln, b.lineItems[i]));
}

/**
 * Resolve the operator's edited invoice from the editor's serialized JSON. Returns
 * editedContent NULL when nothing changed (→ approved-as-is, the positive signal), else the
 * normalized edited invoice (→ gold). Validates structure + per-line number shape (D4).
 */
export function resolveEditedInvoice(rawJson: string, proposed: ProposedInvoice): InvoiceEditResolution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "MALFORMED_INVOICE" };
  }
  const root = (parsed ?? {}) as { lineItems?: unknown; lumpFlag?: unknown; notes?: unknown };
  if (!Array.isArray(root.lineItems)) return { ok: false, error: "MALFORMED_INVOICE" };

  const lineItems = root.lineItems.map(normalizeLine);
  // at least one line, each with a non-empty description AND a valid category.
  if (lineItems.length === 0) return { ok: false, error: "INVOICE_REQUIRES_LINES" };
  if (lineItems.some((ln) => ln.description.length === 0 || (ln.category as string).length === 0)) {
    return { ok: false, error: "INVOICE_REQUIRES_LINES" };
  }
  // D4: operator-edited numbers are accepted IF well-formed (not rejected for differing).
  if (lineItems.some((ln) => !validNumbers(ln))) return { ok: false, error: "INVALID_LINE_NUMBERS" };

  const edited: ProposedInvoice = {
    lineItems,
    lumpFlag: root.lumpFlag === true,
    ...(typeof root.notes === "string" ? { notes: root.notes } : {}),
  };

  // Fair compare: normalize the proposed side the same way (it already carries the full shape).
  const proposedNorm: ProposedInvoice = {
    lineItems: proposed.lineItems.map(normalizeLine),
    lumpFlag: proposed.lumpFlag === true,
    ...(typeof proposed.notes === "string" ? { notes: proposed.notes } : {}),
  };

  return { ok: true, editedContent: invoiceEqual(edited, proposedNorm) ? null : edited };
}
