import { describe, expect, it } from "vitest";

import { parseDateTime, toLocalInputValue } from "./datetime";

describe("parseDateTime", () => {
  it("returns a Date for a well-formed datetime-local string (pinned by local parts)", () => {
    const d = parseDateTime("2024-05-09T07:08");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(4); // May (0-indexed)
    expect(d!.getDate()).toBe(9);
    expect(d!.getHours()).toBe(7);
    expect(d!.getMinutes()).toBe(8);
  });

  it("returns null for an empty string", () => {
    expect(parseDateTime("")).toBeNull();
  });

  it("trims input before parsing", () => {
    const d = parseDateTime(" 2024-05-09T07:08 ");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(4);
    expect(d!.getDate()).toBe(9);
    expect(d!.getHours()).toBe(7);
    expect(d!.getMinutes()).toBe(8);
  });

  it("returns null for obvious rubbish", () => {
    expect(parseDateTime("not a date")).toBeNull();
  });

  it("does NOT return null for a partially-valid form (Date parses date-only as midnight)", () => {
    const d = parseDateTime("2024-05-09");
    expect(d).not.toBeNull();

    // Pin by comparing to the exact Date construction the implementation uses:
    // parseDateTime(value.trim()) -> new Date(trimmedString).
    const expected = new Date("2024-05-09");
    expect(d!.getFullYear()).toBe(expected.getFullYear());
    expect(d!.getMonth()).toBe(expected.getMonth());
    expect(d!.getDate()).toBe(expected.getDate());
  });

  it("returns null for an invalid datetime that produces NaN (out-of-range month)", () => {
    expect(parseDateTime("2024-13-09T07:08")).toBeNull();
  });
});

describe("toLocalInputValue", () => {
  it("returns empty string for null", () => {
    expect(toLocalInputValue(null)).toBe("");
  });

  it("renders YYYY-MM-DDTHH:mm using local getters with zero-padding", () => {
    const d = new Date(2024, 0, 2, 3, 4); // Jan 2, 03:04 local
    const s = toLocalInputValue(d);
    expect(s).toBe("2024-01-02T03:04");
  });

  it("round-trips with parseDateTime for a known local datetime", () => {
    const original = new Date(2024, 11, 31, 23, 59); // Dec 31, 23:59 local
    const s = toLocalInputValue(original);
    const parsed = parseDateTime(s);

    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2024);
    expect(parsed!.getMonth()).toBe(11);
    expect(parsed!.getDate()).toBe(31);
    expect(parsed!.getHours()).toBe(23);
    expect(parsed!.getMinutes()).toBe(59);
  });
});
