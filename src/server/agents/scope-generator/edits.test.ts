import { describe, expect, it } from "vitest";

import { resolveEditedSteps, type EditResolution } from "./edits";
import type { ScopeStep } from "./drafts";

describe("resolveEditedSteps", () => {
  it("returns MALFORMED_STEPS for empty string", () => {
    const out = resolveEditedSteps("", []);
    const expected: EditResolution = { ok: false, error: "MALFORMED_STEPS" };
    expect(out).toEqual(expected);
  });

  it("returns MALFORMED_STEPS when JSON is wrong shape (object instead of array)", () => {
    const out = resolveEditedSteps('{"instruction":"x"}', []);
    const expected: EditResolution = { ok: false, error: "MALFORMED_STEPS" };
    expect(out).toEqual(expected);
  });

  it("returns MALFORMED_STEPS when JSON is malformed", () => {
    const out = resolveEditedSteps("not-json", []);
    const expected: EditResolution = { ok: false, error: "MALFORMED_STEPS" };
    expect(out).toEqual(expected);
  });

  it("returns SCOPE_DRAFT_REQUIRES_STEPS when proposed array would be empty after parsing", () => {
    const out = resolveEditedSteps("[]", []);
    const expected: EditResolution = { ok: false, error: "SCOPE_DRAFT_REQUIRES_STEPS" };
    expect(out).toEqual(expected);
  });

  it("returns SCOPE_DRAFT_REQUIRES_STEPS when any parsed step has empty instruction (after trim normalization)", () => {
    const out = resolveEditedSteps(
      JSON.stringify([
        {
          instruction: "   ",
          category: "perform",
          expectsPhoto: false,
        },
      ] as ScopeStep[]),
      [
        {
          order: 1,
          instruction: "Do the thing",
          category: "perform",
          expectsPhoto: false,
        },
      ],
    );

    const expected: EditResolution = { ok: false, error: "SCOPE_DRAFT_REQUIRES_STEPS" };
    expect(out).toEqual(expected);
  });

  it("returns ok:true + editedSteps:null when the operator JSON is identical to the proposed steps", () => {
    const proposed: ScopeStep[] = [
      { order: 1, instruction: "Clean up site", category: "cleanup", expectsPhoto: true },
      { order: 2, instruction: "Verify quantities", category: "verify", expectsPhoto: false },
    ];

    // Note: resolveEditedSteps normalizes order, trims instruction, normalizes category,
    // and coerces expectsPhoto to (r.expectsPhoto === true).
    const rawJson = JSON.stringify([
      {
        instruction: "Clean up site",
        category: "cleanup",
        expectsPhoto: true,
      },
      {
        instruction: "Verify quantities",
        category: "verify",
        expectsPhoto: false,
      },
    ]);

    const out = resolveEditedSteps(rawJson, proposed);
    const expected: EditResolution = { ok: true, editedSteps: null };
    expect(out).toEqual(expected);
  });

  it("returns editedSteps with one-step change (instruction changed)", () => {
    const proposed: ScopeStep[] = [
      { order: 1, instruction: "Assess job", category: "assess", expectsPhoto: false },
      { order: 2, instruction: "Perform work", category: "perform", expectsPhoto: false },
    ];

    const rawJson = JSON.stringify([
      {
        instruction: "Assess job",
        category: "assess",
        expectsPhoto: false,
      },
      {
        instruction: "Perform work NOW",
        category: "perform",
        expectsPhoto: false,
      },
    ]);

    const out = resolveEditedSteps(rawJson, proposed);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.editedSteps).toEqual([
        {
          order: 1,
          instruction: "Assess job",
          category: "assess",
          expectsPhoto: false,
        },
        {
          order: 2,
          instruction: "Perform work NOW",
          category: "perform",
          expectsPhoto: false,
        },
      ]);
    }
  });

  it("returns editedSteps when the operator adds a step (length increases)", () => {
    const proposed: ScopeStep[] = [
      { order: 1, instruction: "Assess job", category: "assess", expectsPhoto: false },
    ];

    const rawJson = JSON.stringify([
      {
        instruction: "Assess job",
        category: "assess",
        expectsPhoto: false,
      },
      {
        instruction: "Document scope",
        category: "document",
        expectsPhoto: true,
      },
    ]);

    const out = resolveEditedSteps(rawJson, proposed);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.editedSteps).toEqual([
        {
          order: 1,
          instruction: "Assess job",
          category: "assess",
          expectsPhoto: false,
        },
        {
          order: 2,
          instruction: "Document scope",
          category: "document",
          expectsPhoto: true,
        },
      ]);
    }
  });

  it("returns editedSteps when the operator removes a step (length decreases)", () => {
    const proposed: ScopeStep[] = [
      { order: 1, instruction: "Assess job", category: "assess", expectsPhoto: false },
      { order: 2, instruction: "Verify quantities", category: "verify", expectsPhoto: false },
    ];

    const rawJson = JSON.stringify([
      {
        instruction: "Assess job",
        category: "assess",
        expectsPhoto: false,
      },
    ]);

    const out = resolveEditedSteps(rawJson, proposed);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.editedSteps).toEqual([
        {
          order: 1,
          instruction: "Assess job",
          category: "assess",
          expectsPhoto: false,
        },
      ]);
    }
  });

  it("treats missing/unknown category as omitted (category parity via normCategory), so valid inputs can still compare equal", () => {
    // proposed: category omitted
    const proposed: ScopeStep[] = [
      { order: 1, instruction: "Step A", expectsPhoto: true },
    ];

    // operator: unknown category string => normCategory returns null => omitted
    const rawJson = JSON.stringify([
      {
        instruction: " Step A ",
        category: "not-a-category",
        expectsPhoto: true,
      },
    ]);

    const out = resolveEditedSteps(rawJson, proposed);
    const expected: EditResolution = { ok: true, editedSteps: null };
    expect(out).toEqual(expected);
  });

  it("treats expectsPhoto as true only when exactly === true; other values become false in normalization", () => {
    const proposed: ScopeStep[] = [
      { order: 1, instruction: "Step A", category: "perform", expectsPhoto: false },
    ];

    const rawJson = JSON.stringify([
      {
        instruction: "Step A",
        category: "perform",
        expectsPhoto: 1,
      },
    ]);

    const out = resolveEditedSteps(rawJson, proposed);
    // normalization yields expectsPhoto false, so should compare equal
    const expected: EditResolution = { ok: true, editedSteps: null };
    expect(out).toEqual(expected);
  });
});
