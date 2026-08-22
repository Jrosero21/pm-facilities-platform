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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ★ THE TIMEZONE-AWARE PAIR — toZonedInputValue / parseZonedDateTime.
//
// Every assertion below states an EXPLICIT zone and an EXPLICIT expected wall clock. That is what
// makes them meaningful: the runtime-local pair above would fail these on any machine not already
// sitting in the asserted zone, which is precisely the defect being fixed.
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { isValidTimeZone, parseZonedDateTime, toZonedInputValue } from "./datetime";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const RUNTIME_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("toZonedInputValue — renders the wall clock of the SITE, not of the runtime", () => {
  // 20:00Z is 4:00 PM in New York and 1:00 PM in Los Angeles. One instant, two form values.
  const instant = new Date("2026-08-27T20:00:00.000Z");

  it("renders the same instant differently per zone", () => {
    expect(toZonedInputValue(instant, NY)).toBe("2026-08-27T16:00");
    expect(toZonedInputValue(instant, LA)).toBe("2026-08-27T13:00");
    expect(toZonedInputValue(instant, "UTC")).toBe("2026-08-27T20:00");
  });

  it("is independent of the runtime zone", () => {
    // If this used the host's getters (the old behaviour) it could only be right on a machine
    // already in that zone. Asserting both zones at once means no single runtime satisfies both
    // by accident.
    const ny = toZonedInputValue(instant, NY);
    const la = toZonedInputValue(instant, LA);
    expect(ny).not.toBe(la);
    expect(ny).toBe("2026-08-27T16:00");
  });

  it("crosses the date boundary correctly", () => {
    // 02:30Z on the 28th is still 22:30 on the 27th in New York.
    const late = new Date("2026-08-28T02:30:00.000Z");
    expect(toZonedInputValue(late, NY)).toBe("2026-08-27T22:30");
    expect(toZonedInputValue(late, "UTC")).toBe("2026-08-28T02:30");
  });

  it("zero-pads and renders midnight as 00, never 24", () => {
    expect(toZonedInputValue(new Date("2026-01-02T05:00:00.000Z"), NY)).toBe("2026-01-02T00:00");
  });

  it("returns empty string for null/undefined/invalid", () => {
    expect(toZonedInputValue(null, NY)).toBe("");
    expect(toZonedInputValue(undefined, NY)).toBe("");
    expect(toZonedInputValue(new Date("nonsense"), NY)).toBe("");
  });
});

describe("parseZonedDateTime — reads the typed wall clock AS the site's zone", () => {
  it("produces the instant the operator meant", () => {
    expect(parseZonedDateTime("2026-08-27T16:00", NY)?.toISOString())
      .toBe("2026-08-27T20:00:00.000Z");
    expect(parseZonedDateTime("2026-08-27T13:00", LA)?.toISOString())
      .toBe("2026-08-27T20:00:00.000Z");
  });

  it("the same typed string means different instants in different zones", () => {
    const a = parseZonedDateTime("2026-08-27T09:00", NY)!;
    const b = parseZonedDateTime("2026-08-27T09:00", LA)!;
    expect(b.getTime() - a.getTime()).toBe(3 * 60 * 60 * 1000); // LA is 3h behind
  });

  it("returns null for blank or unparseable input", () => {
    for (const v of ["", "   ", "not a date", "2026-13-09T07:08", "2026-08-27T25:00"]) {
      expect(parseZonedDateTime(v, NY), v).toBeNull();
    }
  });

  it("accepts a date-only value as midnight in the zone", () => {
    expect(parseZonedDateTime("2026-08-27", NY)?.toISOString()).toBe("2026-08-27T04:00:00.000Z");
  });
});

describe("★ the pair round-trips — render and parse must agree", () => {
  it.each([
    ["2026-08-27T20:00:00.000Z", NY], ["2026-08-27T20:00:00.000Z", LA],
    ["2026-01-15T19:04:00.000Z", NY], ["2026-06-30T23:59:00.000Z", "UTC"],
    ["2026-12-31T08:00:00.000Z", "Pacific/Honolulu"], ["2026-03-15T12:00:00.000Z", "America/Phoenix"],
  ])("survives %s in %s", (iso, tz) => {
    const original = new Date(iso);
    const rendered = toZonedInputValue(original, tz);
    const parsed = parseZonedDateTime(rendered, tz);
    expect(parsed?.toISOString()).toBe(iso);
  });
});

// ★ DST is where a naive single-pass offset calculation silently breaks. US transitions in 2026:
// spring forward Mar 8, fall back Nov 1.
describe("DST transitions", () => {
  it("applies the offset in force on each side of spring-forward", () => {
    // Mar 7 is EST (-5); Mar 9 is EDT (-4). Same typed wall clock, one hour apart in UTC terms.
    expect(parseZonedDateTime("2026-03-07T12:00", NY)?.toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(parseZonedDateTime("2026-03-09T12:00", NY)?.toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });

  it("applies the offset in force on each side of fall-back", () => {
    expect(parseZonedDateTime("2026-10-31T12:00", NY)?.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(parseZonedDateTime("2026-11-02T12:00", NY)?.toISOString()).toBe("2026-11-02T17:00:00.000Z");
  });

  // 02:30 on spring-forward morning does not exist in New York. Resolving it to the nearest real
  // instant beats returning null — an operator typing a nonexistent time still gets a booking.
  it("resolves a spring-forward gap time to a real instant rather than null", () => {
    const gap = parseZonedDateTime("2026-03-08T02:30", NY);
    expect(gap).not.toBeNull();
    expect(Number.isNaN(gap!.getTime())).toBe(false);
  });

  it("honours a zone that does not observe DST at all", () => {
    // Phoenix stays at -7 year-round, so summer and winter agree.
    expect(parseZonedDateTime("2026-01-15T12:00", "America/Phoenix")?.toISOString())
      .toBe("2026-01-15T19:00:00.000Z");
    expect(parseZonedDateTime("2026-07-15T12:00", "America/Phoenix")?.toISOString())
      .toBe("2026-07-15T19:00:00.000Z");
  });
});

describe("invalid zones degrade instead of throwing", () => {
  it("isValidTimeZone identifies usable zones", () => {
    expect(isValidTimeZone(NY)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("falls back to the runtime-local pair rather than throwing", () => {
    const d = new Date(2026, 7, 27, 16, 0);
    expect(() => toZonedInputValue(d, "Not/AZone")).not.toThrow();
    expect(toZonedInputValue(d, "Not/AZone")).toBe(toLocalInputValue(d));
    expect(() => parseZonedDateTime("2026-08-27T16:00", "Not/AZone")).not.toThrow();
  });
});

// Documents the defect being replaced. Skipped when the runtime happens to BE the asserted zone,
// because there the old behaviour is accidentally correct — which is exactly why this shipped.
describe("the old runtime-local pair is zone-dependent (the bug)", () => {
  it.runIf(RUNTIME_TZ !== NY)("toLocalInputValue disagrees with the site render off-zone", () => {
    const instant = new Date("2026-08-27T20:00:00.000Z");
    expect(toLocalInputValue(instant)).not.toBe(toZonedInputValue(instant, NY));
  });
});
