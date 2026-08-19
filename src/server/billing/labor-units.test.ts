import { describe, expect, it } from "vitest";

import { isTimeUnit } from "@/server/billing/labor-units";

describe("labor-units.isTimeUnit", () => {
  it("returns true for recognized hour units (case-insensitive; punctuation/spacing ignored)", () => {
    expect(isTimeUnit("hr")).toBe(true);
    expect(isTimeUnit("HRS")).toBe(true);
    expect(isTimeUnit("hour")).toBe(true);
    expect(isTimeUnit("Hours")).toBe(true);

    // whitespace/dots/hyphens stripped before matching
    expect(isTimeUnit("hr.")).
      toBe(true);
    expect(isTimeUnit(" man-hr ")).toBe(true);
    expect(isTimeUnit("man - hours")).toBe(true);
    expect(isTimeUnit("man-hours")).toBe(true);
  });

  it("returns true for recognized man-hour family units", () => {
    expect(isTimeUnit("manhr")).toBe(true);
    expect(isTimeUnit("manhrs")).toBe(true);
    expect(isTimeUnit("manhour")).toBe(true);
    expect(isTimeUnit("manhours")).toBe(true);

    // punctuation/spacing ignored
    expect(isTimeUnit("man-hours")).toBe(true);
    expect(isTimeUnit("man hr")).toBe(true);
  });

  it("returns false for null/undefined/empty and non-time units", () => {
    expect(isTimeUnit(null)).toBe(false);
    expect(isTimeUnit(undefined)).toBe(false);
    expect(isTimeUnit("")).toBe(false);

    // not recognized labor-count units; only explicit time units are treated as time
    expect(isTimeUnit("each")).toBe(false);
    expect(isTimeUnit("ea")).toBe(false);
    expect(isTimeUnit("lot")).toBe(false);
    expect(isTimeUnit("lump")).toBe(false);
    expect(isTimeUnit("job")).toBe(false);
    expect(isTimeUnit("hourly")).toBe(false);
    expect(isTimeUnit("minutes")).toBe(false);
  });

  it("is case-sensitive only insofar as it normalizes to lowercase before matching", () => {
    // real unit with differently-cased input should still match
    expect(isTimeUnit("Hr")).toBe(true);

    // but arbitrary strings remain false
    expect(isTimeUnit("MAN-HRZ")).toBe(false);
  });
});
