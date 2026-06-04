// ── Phase 27 batch 4b — PROPOSAL PHRASING PROJECTION + SIGNAL THRESHOLDS (pure util) ──
// PURE util — NO "server-only", NO DB, NO IO. The proposal correction signal is STRUCTURALLY
// different from the invoice agent's: a proposal draft is NUMBER-FREE, so the operator always
// authors pricing at the gate (edited_content is never null on a valid publish). The invoice
// "edited_content == null = approved-as-is" test therefore does not translate. Instead we compare
// the PHRASING ONLY (numbers dropped) of the draft vs the operator's edited content via edit
// distance: phrasing kept ~as-is = approved-as-is; refined = a teaching correction; rewritten = noise.
//
// This projection is BOTH the edit-distance input AND the stored draftContent/editedContent on the
// correction pair — so few-shot examples are NUMBER-FREE BY CONSTRUCTION (the dollar fields are
// never read here, even when the operator's edited content contains them).

/**
 * Project a proposal JSON string (draft proposed_proposal OR edited content) to a phrasing-only
 * string: per line `category + " " + description + " " + scopePhrasing`, joined by newline. ALL
 * numeric/pricing fields (quantity, unitPrice, markupPercent, taxRate, taxAmount) are DROPPED — we
 * simply never read them, so operator-authored numbers on edited content are ignored. Malformed /
 * unparseable input → "" (defensive, mirrors the draft-layer parse boundaries).
 */
export function phrasingOnly(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return "";
  }
  const obj = (parsed as { lineItems?: unknown } | null) ?? null;
  const items = obj && Array.isArray(obj.lineItems) ? obj.lineItems : [];
  return items
    .map((raw) => {
      const ln = (raw ?? {}) as { category?: unknown; description?: unknown; scopePhrasing?: unknown };
      const category = typeof ln.category === "string" ? ln.category : "";
      const description = typeof ln.description === "string" ? ln.description : "";
      const scopePhrasing = typeof ln.scopePhrasing === "string" ? ln.scopePhrasing : "";
      return `${category} ${description} ${scopePhrasing}`.trim();
    })
    .join("\n");
}

// Conservative MVP defaults — tunable once real proposal-review data exists (Phase 25 calibration).
// Distance d = normalizedLevenshtein(phrasingOnly(draft), phrasingOnly(edited)):
//   d <= GOLD_MAX     → positive  (draft phrasing kept ~as-is; the assistant turn is the DRAFT)
//   d >= NEGATIVE_MIN → negative  (heavy rewrite; excluded from few-shot)
//   in between        → gold      (refined; the assistant turn is the EDITED content — the teaching example)
// GOLD_MAX is the LOWER edge of the gold band: at/below it the edit is too small to teach (positive).
export const PROPOSAL_PHRASING_GOLD_MAX = 0.15;
export const PROPOSAL_PHRASING_NEGATIVE_MIN = 0.5;
