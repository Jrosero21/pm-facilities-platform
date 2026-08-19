import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/format-date";

// The whole point of this module: a bare toLocaleString renders in the HOST's zone, so the same
// instant read differently on a dev Mac (Pacific), on Vercel (UTC), and in the office (New York).
// Every assertion here pins an explicit zone, which is what makes them stable in CI.
const AUG = new Date("2026-08-18T19:04:05Z"); // EDT, UTC-4
const JAN = new Date("2026-01-15T19:04:05Z"); // EST, UTC-5
const LATE = new Date("2026-08-19T02:30:00Z"); // still Aug 18 in New York

describe("formatDate", () => {
  it("defaults to America/New_York", () => {
    expect(formatDate(AUG)).toBe("Aug 18, 2026");
  });

  it("honours an explicit zone, including across the date boundary", () => {
    expect(formatDate(LATE)).toBe("Aug 18, 2026");
    expect(formatDate(LATE, "UTC")).toBe("Aug 19, 2026");
  });

  it.each([[null], [undefined], [new Date("nonsense")]])("renders the em dash for %s", (input) => {
    expect(formatDate(input as Date | null | undefined)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("defaults to America/New_York", () => {
    expect(formatDateTime(AUG)).toBe("Aug 18, 2026, 3:04 PM");
  });

  it("honours an explicit zone", () => {
    expect(formatDateTime(AUG, "UTC")).toBe("Aug 18, 2026, 7:04 PM");
    expect(formatDateTime(LATE)).toBe("Aug 18, 2026, 10:30 PM");
  });

  // Same wall-clock UTC input, five months apart: proves the offset is really applied
  // rather than hardcoded, since the New York offset changes with DST.
  it("applies daylight saving", () => {
    expect(formatDateTime(AUG)).toBe("Aug 18, 2026, 3:04 PM"); // EDT
    expect(formatDateTime(JAN)).toBe("Jan 15, 2026, 2:04 PM"); // EST
  });

  it.each([
    [new Date("2026-08-18T04:00:00Z"), "Aug 18, 2026, 12:00 AM"],
    [new Date("2026-08-18T16:00:00Z"), "Aug 18, 2026, 12:00 PM"],
  ])("renders midnight and noon unambiguously (%#)", (input, expected) => {
    expect(formatDateTime(input)).toBe(expected);
  });

  it.each([[null], [undefined], [new Date("nonsense")]])("renders the em dash for %s", (input) => {
    expect(formatDateTime(input as Date | null | undefined)).toBe("—");
  });
});
