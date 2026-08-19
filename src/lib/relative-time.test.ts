import { describe, expect, it } from "vitest";
import { compactAge, relativeTime } from "@/lib/relative-time";

// `now` is injected, never read from the clock — which is the only reason this is testable at all.
const NOW = new Date("2026-08-18T12:00:00Z");
const at = (ms: number): Date => new Date(NOW.getTime() + ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it.each([
    [-30 * SEC, "30 seconds ago"],
    [-45 * MIN, "45 minutes ago"],
    [-3 * HOUR, "3 hours ago"],
    [-1 * DAY, "yesterday"],
    [-3 * DAY, "3 days ago"],
    [-60 * DAY, "2 months ago"],
    [-400 * DAY, "last year"],
  ])("renders %s ms ago as %s", (offset, expected) => {
    expect(relativeTime(at(offset), NOW)).toBe(expected);
  });

  it.each([
    [2 * HOUR, "in 2 hours"],
    [1 * DAY, "tomorrow"],
  ])("renders the future offset %s ms as %s", (offset, expected) => {
    expect(relativeTime(at(offset), NOW)).toBe(expected);
  });

  it.each([
    [-60 * SEC, "1 minute ago"],
    [-24 * HOUR, "yesterday"],
    [-30 * DAY, "last month"],
  ])("steps up cleanly at the %s ms boundary", (offset, expected) => {
    expect(relativeTime(at(offset), NOW)).toBe(expected);
  });

  it("renders the same instant as now", () => {
    expect(relativeTime(NOW, NOW)).toBe("now");
  });
});

describe("compactAge", () => {
  it.each([
    [0, "0s"],
    [45, "45s"],
    [59.9, "59s"],
    [60, "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [86399, "23h"],
    [86400, "1d"],
    [172800, "2d"],
  ])("renders %s seconds as %s", (seconds, expected) => {
    expect(compactAge(seconds)).toBe(expected);
  });

  it("clamps a negative age to zero", () => {
    expect(compactAge(-5)).toBe("0s");
  });

  // Guard against "NaNd" reaching the UI — this shipped once.
  it.each([[NaN], [Infinity], [-Infinity]])("renders the em dash for the non-finite %s", (seconds) => {
    expect(compactAge(seconds)).toBe("—");
  });
});
