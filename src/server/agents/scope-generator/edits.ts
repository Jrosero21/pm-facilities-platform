import type { ScopeStep } from "./drafts";

// ── Phase 7 batch 7d.2 — edited-steps resolution (pure, no DB) ─────────────────────────
// The approve-path logic, extracted as a pure function so it's testable without a request
// session (the action is a thin wrapper). Parses the editor's serialized JSON, VALIDATES
// (null-vs-empty decision (a): a scope needs ≥1 step, each with non-empty instruction), and
// computes editedSteps NULL-IF-UNCHANGED vs the draft's proposed_steps across the full D3
// affordance surface (instruction / category / expectsPhoto / order), mirroring the
// rewriter's editedContent-vs-draftContent null discipline.

const CATEGORIES = ["assess", "perform", "cleanup", "verify", "document"] as const;
type Category = (typeof CATEGORIES)[number];
function normCategory(c: unknown): Category | null {
  return typeof c === "string" && (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : null;
}

export type EditResolution =
  | { ok: true; editedSteps: ScopeStep[] | null }
  | { ok: false; error: "MALFORMED_STEPS" | "SCOPE_DRAFT_REQUIRES_STEPS" };

// Equality across the full D3 affordance set: any change to length, ordering, instruction
// text, category (including null/'none' parity), or expectsPhoto breaks equality and produces
// non-null editedSteps (source='edited' at publish). If a future affordance is added to D3
// (e.g., per-step notes, per-step photo counts), this comparison MUST be extended in lockstep.
// Silent under-comparison classifies real edits as no-edit, producing source='ai_generated' on
// operator-edited steps.
function stepsEqual(a: ScopeStep[], b: ScopeStep[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (s, i) =>
      s.instruction === b[i].instruction &&
      normCategory(s.category) === normCategory(b[i].category) &&
      (s.expectsPhoto ?? false) === (b[i].expectsPhoto ?? false),
  );
}

/** Normalize an editor step: trim instruction, coerce category to a valid value or undefined,
 *  expectsPhoto to a boolean, order to its 1-based position. */
function normalize(raw: unknown, index: number): ScopeStep {
  const r = (raw ?? {}) as { instruction?: unknown; category?: unknown; expectsPhoto?: unknown };
  const category = normCategory(r.category);
  return {
    order: index + 1,
    instruction: typeof r.instruction === "string" ? r.instruction.trim() : "",
    ...(category ? { category } : {}),
    expectsPhoto: r.expectsPhoto === true,
  };
}

export function resolveEditedSteps(rawJson: string, proposed: ScopeStep[]): EditResolution {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "MALFORMED_STEPS" };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "MALFORMED_STEPS" };

  const steps = parsed.map(normalize);
  // null-vs-empty decision (a): at least one step, every instruction non-empty.
  if (steps.length === 0 || steps.some((s) => s.instruction.length === 0)) {
    return { ok: false, error: "SCOPE_DRAFT_REQUIRES_STEPS" };
  }
  // NULL when the operator changed nothing (→ source='ai_generated' at publish); else the
  // edited set (→ source='edited'). proposed is normalized the same way for a fair compare.
  const proposedNorm = proposed.map((s, i) => normalize(s, i));
  return { ok: true, editedSteps: stepsEqual(steps, proposedNorm) ? null : steps };
}
