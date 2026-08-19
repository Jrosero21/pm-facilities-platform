import { describe, expect, it } from "vitest";
import { findVocabularyDrift } from "@/server/billing/line-item-type-invariant";

describe("line-item-type-invariant", () => {
  it("no drift when enum values match exactly the stored row keys", () => {
    const enumValues = [
      "labor",
      "materials",
      "equipment",
      "trip",
      "permit",
      "fee",
      "tax",
      "other",
    ] as const;
    const rowKeys = [
      "labor",
      "materials",
      "equipment",
      "trip",
      "permit",
      "fee",
      "tax",
      "other",
    ] as const;

    expect(findVocabularyDrift(enumValues, rowKeys)).toEqual({
      missingRows: [],
      customKeys: [],
    });
  });

  it("custom keys are not reported as missing", () => {
    const enumValues = [
      "labor",
      "materials",
      "equipment",
      "trip",
      "permit",
      "fee",
      "tax",
      "other",
    ] as const;
    const rowKeys = [
      "labor",
      "materials",
      "equipment",
      "trip",
      "permit",
      "fee",
      "tax",
      "other",
      "subcontract",
    ] as const;

    expect(findVocabularyDrift(enumValues, rowKeys)).toEqual({
      missingRows: [],
      customKeys: ["subcontract"],
    });
  });

  it("reports missing enum values in sorted order and no custom keys when row keys are a subset", () => {
    const enumValues = [
      "labor",
      "materials",
      "equipment",
      "trip",
      "permit",
      "fee",
      "tax",
      "other",
    ] as const;

    const rowKeys = ["labor", "other"] as const;

    expect(findVocabularyDrift(enumValues, rowKeys)).toEqual({
      missingRows: [
        "equipment",
        "fee",
        "materials",
        "permit",
        "tax",
        "trip",
      ],
      customKeys: [],
    });
  });

  it("does not mutate the caller's input arrays (including preserving original unsorted order)", () => {
    const enumValues = [
      "trip",
      "labor",
      "tax",
      "other",
      "materials",
      "fee",
      "equipment",
      "permit",
    ] as string[];

    const rowKeys = [
      "other",
      "labor",
      "subcontract",
      "materials",
      "trip",
      "tax",
      "equipment",
      "permit",
      "fee",
    ] as string[];

    const enumSnapshot = [...enumValues];
    const rowKeysSnapshot = [...rowKeys];

    findVocabularyDrift(enumValues, rowKeys);

    expect(enumValues).toEqual(enumSnapshot);
    expect(rowKeys).toEqual(rowKeysSnapshot);
  });
});
