import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_TIME_ZONE, formatDate, formatDateTime, timeZoneAbbreviation } from "@/lib/format-date";

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
    expect(formatDateTime(AUG)).toBe("Aug 18, 2026, 3:04 PM EDT");
  });

  it("honours an explicit zone", () => {
    expect(formatDateTime(AUG, "UTC")).toBe("Aug 18, 2026, 7:04 PM UTC");
    expect(formatDateTime(LATE)).toBe("Aug 18, 2026, 10:30 PM EDT");
  });

  // Same wall-clock UTC input, five months apart: proves the offset is really applied
  // rather than hardcoded, since the New York offset changes with DST.
  // The label follows DST too (EDT/EST), which a static "(site time)" suffix could not do.
  it("applies daylight saving", () => {
    expect(formatDateTime(AUG)).toBe("Aug 18, 2026, 3:04 PM EDT");
    expect(formatDateTime(JAN)).toBe("Jan 15, 2026, 2:04 PM EST");
  });

  it.each([
    [new Date("2026-08-18T04:00:00Z"), "Aug 18, 2026, 12:00 AM EDT"],
    [new Date("2026-08-18T16:00:00Z"), "Aug 18, 2026, 12:00 PM EDT"],
  ])("renders midnight and noon unambiguously (%#)", (input, expected) => {
    expect(formatDateTime(input)).toBe(expected);
  });

  it.each([[null], [undefined], [new Date("nonsense")]])("renders the em dash for %s", (input) => {
    expect(formatDateTime(input as Date | null | undefined)).toBe("—");
  });
});

// ★ THE ZONE LABEL — added when schedule times moved to the site's timezone.
//
// A time without a zone is not actionable once more than one zone is in play: a vendor two states
// away cannot tell 4:00 PM Eastern from 4:00 PM local, and nobody can tell a real site-zone render
// from the fallback. These pin the label so it cannot later be dropped as visual noise.
describe("formatDateTime always labels the zone", () => {
  it("labels the default zone", () => {
    expect(formatDateTime(AUG)).toMatch(/ EDT$/);
  });

  it("labels an explicit zone", () => {
    expect(formatDateTime(AUG, "America/Los_Angeles")).toBe("Aug 18, 2026, 12:04 PM PDT");
    expect(formatDateTime(AUG, "America/Chicago")).toBe("Aug 18, 2026, 2:04 PM CDT");
  });

  it("labels the FALLBACK render too — the case that is currently universal", () => {
    // client_locations.timezone is null everywhere today, so undefined is the live path. A
    // fallback rendering unlabeled would be indistinguishable from a real site-zone value.
    expect(formatDateTime(AUG, undefined)).toContain("EDT");
  });

  it("never renders a time with no zone at all", () => {
    for (const tz of [undefined, "UTC", "America/Denver", "Pacific/Honolulu"]) {
      expect(formatDateTime(AUG, tz)).toMatch(/\d:\d{2} (AM|PM) \S+$/);
    }
  });
});

// formatDate is deliberately NOT labeled — a date has no wall-clock to misapply, and "Aug 18, 2026
// EDT" reads as a bug. The zone still selects WHICH calendar day an instant falls on, which the
// date-boundary test above covers.
describe("formatDate stays unlabeled", () => {
  it("has no zone suffix", () => {
    expect(formatDate(AUG)).toBe("Aug 18, 2026");
    expect(formatDate(AUG, "America/Los_Angeles")).toBe("Aug 18, 2026");
  });
});

describe("DEFAULT_DISPLAY_TIME_ZONE", () => {
  it("is the fallback the formatters actually use", () => {
    expect(DEFAULT_DISPLAY_TIME_ZONE).toBe("America/New_York");
    expect(formatDateTime(AUG)).toBe(formatDateTime(AUG, DEFAULT_DISPLAY_TIME_ZONE));
  });
});

describe("timeZoneAbbreviation", () => {
  it("returns the abbreviation for the instant's side of DST", () => {
    expect(timeZoneAbbreviation("America/New_York", AUG)).toBe("EDT");
    expect(timeZoneAbbreviation("America/New_York", JAN)).toBe("EST");
    expect(timeZoneAbbreviation("America/Los_Angeles", AUG)).toBe("PDT");
  });

  it("handles zones without DST", () => {
    expect(timeZoneAbbreviation("America/Phoenix", AUG)).toBe("MST");
    expect(timeZoneAbbreviation("America/Phoenix", JAN)).toBe("MST");
  });

  it("falls back to the zone id rather than throwing", () => {
    expect(() => timeZoneAbbreviation("Not/AZone", AUG)).not.toThrow();
    expect(timeZoneAbbreviation("Not/AZone", AUG)).toBe("Not/AZone");
  });
});
