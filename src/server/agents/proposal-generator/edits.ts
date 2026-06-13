import { isDecimalStr } from "@/server/billing/money";
import { lineItemCategoryEnum } from "@/server/schema/billing-shared";
import type { RateType } from "@/server/billing/client-rates";
import type { ProposedProposal, ProposedProposalLine, ProposalLineCategory } from "./drafts";

// ── Phase 27 batch 3b — edited-proposal resolution (pure, no DB) ───────────────────────
// The approve-path logic, extracted as a pure function so it's testable without a request
// session (the action is a thin wrapper). Parses the editor's serialized JSON, VALIDATES
// (≥1 line, each with a non-empty description, scopePhrasing, a valid category, and well-formed
// decimal quantity/unit_price), and computes editedContent NULL-IF-UNCHANGED vs the draft's
// proposed_proposal across the full line shape — mirroring invoice-creator/edits.ts.
//
// D4 (money authoring is a HUMAN affordance): the proposal draft is NUMBER-FREE — the operator's
// quantity/unit_price are where dollars FIRST appear. We validate they are well-formed decimal
// strings; we do NOT reject them for any particular value. Because pricing is MANDATORY here
// (validNumbers requires it), a number-free draft submitted unchanged FAILS validation rather
// than producing an unpriced approve-as-is — pricing cannot be skipped. The null-if-unchanged
// branch is retained for mirror-parity (reachable only if a draft already carried valid numbers).
//
// NOTE FOR BATCH 4 (correction signal — do NOT solve here): this agent's signal is STRUCTURALLY
// different from the invoice agent. Because the draft is number-free, a valid publish ALWAYS has
// the operator authoring pricing → editedContent is NEVER null on a real publish. So
// proposalCorrectionPairs CANNOT reuse the invoice's "null editedContent = approved-as-is =
// positive signal" — every published proposal would look like edited/gold. Batch 4 needs a
// DIFFERENT signal for proposals (e.g. phrasing edit-distance between the draft's description/
// scopePhrasing and the operator's, ignoring the always-added numbers).

function normCategory(c: unknown): ProposalLineCategory | null {
  return typeof c === "string" && (lineItemCategoryEnum as readonly string[]).includes(c)
    ? (c as ProposalLineCategory)
    : null;
}

// Phase (ii) Unit 2a — accept only valid rate_type provenance from the editor's submitted JSON
// (mirrors the client_rates enum). A type-only RateType import keeps this module DB-free / pure;
// the literal set is the runtime guard. An unrecognized value drops to undefined (no provenance).
const RATE_TYPES: readonly string[] = ["hourly", "flat", "trip_charge", "per_unit", "emergency", "after_hours"];
function normRateType(v: unknown): RateType | undefined {
  return typeof v === "string" && RATE_TYPES.includes(v) ? (v as RateType) : undefined;
}

export type ProposalEditResolution =
  | { ok: true; editedContent: ProposedProposal | null }
  | { ok: false; error: "MALFORMED_PROPOSAL" | "PROPOSAL_REQUIRES_LINES" | "INVALID_LINE_NUMBERS" };

// money decimal shapes (match the proposal_line_items column precisions): quantity decimal(10,2)
// ⇒ maxIntDigits 8; unit_price decimal(12,2) ⇒ maxIntDigits 10; markup_percent decimal(6,3)
// ⇒ maxIntDigits 3, scale 3. quantity + unit_price are REQUIRED (a proposal line must be priced).
function validNumbers(ln: ProposedProposalLine): boolean {
  if (typeof ln.quantity !== "string" || !isDecimalStr(ln.quantity, 8, 2)) return false;
  if (typeof ln.unitPrice !== "string" || !isDecimalStr(ln.unitPrice, 10, 2)) return false;
  if (ln.markupPercent != null && !isDecimalStr(ln.markupPercent, 3, 3)) return false;
  return true;
}

// Normalize one editor line: trim description/scopePhrasing, coerce category, keep number fields
// as strings (string|"" when absent — validation then rejects). unit/markupPercent/taxRate/
// taxAmount preserved (null-normalized for a fair compare).
function normalizeLine(raw: unknown): ProposedProposalLine {
  const r = (raw ?? {}) as {
    category?: unknown;
    description?: unknown;
    scopePhrasing?: unknown;
    quantity?: unknown;
    unit?: unknown;
    unitPrice?: unknown;
    markupPercent?: unknown;
    taxRate?: unknown;
    taxAmount?: unknown;
    tradeId?: unknown;
    rateType?: unknown;
  };
  return {
    category: normCategory(r.category) ?? ("" as ProposalLineCategory),
    description: typeof r.description === "string" ? r.description.trim() : "",
    scopePhrasing: typeof r.scopePhrasing === "string" ? r.scopePhrasing.trim() : "",
    quantity: typeof r.quantity === "string" ? r.quantity : "",
    unit: typeof r.unit === "string" ? r.unit : null,
    unitPrice: typeof r.unitPrice === "string" ? r.unitPrice : "",
    markupPercent: typeof r.markupPercent === "string" ? r.markupPercent : null,
    taxRate: typeof r.taxRate === "string" ? r.taxRate : null,
    taxAmount: typeof r.taxAmount === "string" ? r.taxAmount : "0",
    // Phase (ii) Unit 2a — agreed-rate provenance the editor kept (price unchanged). Absent ⇒ null
    // tradeId / undefined rateType (no provenance; the line bills with normal markup at publish).
    tradeId: typeof r.tradeId === "string" ? r.tradeId : null,
    rateType: normRateType(r.rateType),
  };
}

function linesEqual(a: ProposedProposalLine, b: ProposedProposalLine): boolean {
  return (
    a.category === b.category &&
    a.description === b.description &&
    a.scopePhrasing === b.scopePhrasing &&
    (a.quantity ?? "") === (b.quantity ?? "") &&
    (a.unit ?? null) === (b.unit ?? null) &&
    (a.unitPrice ?? "") === (b.unitPrice ?? "") &&
    (a.markupPercent ?? null) === (b.markupPercent ?? null) &&
    (a.taxRate ?? null) === (b.taxRate ?? null) &&
    (a.taxAmount ?? "0") === (b.taxAmount ?? "0") &&
    (a.tradeId ?? null) === (b.tradeId ?? null) &&
    (a.rateType ?? null) === (b.rateType ?? null)
  );
}

function proposalEqual(a: ProposedProposal, b: ProposedProposal): boolean {
  if (a.lineItems.length !== b.lineItems.length) return false;
  if ((a.notes ?? "") !== (b.notes ?? "")) return false;
  return a.lineItems.every((ln, i) => linesEqual(ln, b.lineItems[i]));
}

/**
 * Resolve the operator's edited proposal from the editor's serialized JSON. Returns
 * editedContent NULL when nothing changed (→ approved-as-is), else the normalized edited
 * proposal (→ gold). Validates structure + per-line number shape (D4). Because pricing is
 * required, a number-free draft cannot pass unchanged.
 */
export function resolveEditedProposal(rawJson: string, proposed: ProposedProposal): ProposalEditResolution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "MALFORMED_PROPOSAL" };
  }
  const root = (parsed ?? {}) as { lineItems?: unknown; notes?: unknown };
  if (!Array.isArray(root.lineItems)) return { ok: false, error: "MALFORMED_PROPOSAL" };

  const lineItems = root.lineItems.map(normalizeLine);
  // at least one line, each with a non-empty description, scopePhrasing AND a valid category.
  if (lineItems.length === 0) return { ok: false, error: "PROPOSAL_REQUIRES_LINES" };
  if (
    lineItems.some(
      (ln) =>
        ln.description.length === 0 ||
        ln.scopePhrasing.length === 0 ||
        (ln.category as string).length === 0,
    )
  ) {
    return { ok: false, error: "PROPOSAL_REQUIRES_LINES" };
  }
  // D4: operator-authored numbers are required AND must be well-formed decimal strings.
  if (lineItems.some((ln) => !validNumbers(ln))) return { ok: false, error: "INVALID_LINE_NUMBERS" };

  const edited: ProposedProposal = {
    lineItems,
    ...(typeof root.notes === "string" ? { notes: root.notes } : {}),
  };

  // Fair compare: normalize the proposed side the same way (it carries the number-free shape).
  const proposedNorm: ProposedProposal = {
    lineItems: proposed.lineItems.map(normalizeLine),
    ...(typeof proposed.notes === "string" ? { notes: proposed.notes } : {}),
  };

  return { ok: true, editedContent: proposalEqual(edited, proposedNorm) ? null : edited };
}
