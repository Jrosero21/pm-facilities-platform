import { describe, expect, it } from "vitest";

import {
  HIGH_PRIORITY_RANK_CUTOFF,
  STALLED_THRESHOLDS_SECONDS,
  URGENCY_TIER_ORDER,
  isStalled,
  type UrgencyTier,
} from "./stalled-rules";

describe("stalled-rules characterization", () => {
  it("pins STALLED_THRESHOLDS_SECONDS (exact seconds per status)", () => {
    expect(STALLED_THRESHOLDS_SECONDS).toEqual({
      NEW: 4 * 3600,
      SCHEDULED: 2 * 3600,
      DISPATCHED: 24 * 3600,
      IN_PROGRESS: 72 * 3600,
      ON_HOLD: 7 * 24 * 3600,
    });
  });

  it("pins URGENCY_TIER_ORDER (exact precedence list order)", () => {
    expect(URGENCY_TIER_ORDER).toEqual(["stalled", "overdue", "unassigned-high-priority", "aged"]);
  });

  it("pins HIGH_PRIORITY_RANK_CUTOFF", () => {
    expect(HIGH_PRIORITY_RANK_CUTOFF).toBe(2);
  });

  it("exports UrgencyTier as the union of URGENCY_TIER_ORDER elements (runtime check via membership)", () => {
    // runtime-only membership check; compile-time union is exercised by typed literals
    const t1: UrgencyTier = "stalled";
    const t2: UrgencyTier = "aged";

    expect(URGENCY_TIER_ORDER.includes(t1)).toBe(true);
    expect(URGENCY_TIER_ORDER.includes(t2)).toBe(true);
  });

  describe("isStalled", () => {
    const nowMs = 1_700_000_000_000; // deterministic

    it("non-SCHEDULED: NEW stalls iff dwellSeconds is > threshold (below, equal, above)", () => {
      const thresholdSeconds = STALLED_THRESHOLDS_SECONDS.NEW;

      expect(
        isStalled({
          statusCode: "NEW",
          dwellSeconds: thresholdSeconds - 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "NEW",
          dwellSeconds: thresholdSeconds,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "NEW",
          dwellSeconds: thresholdSeconds + 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(true);
    });

    it("non-SCHEDULED: DISPATCHED stalls iff dwellSeconds is > threshold (below, equal, above)", () => {
      const thresholdSeconds = STALLED_THRESHOLDS_SECONDS.DISPATCHED;

      expect(
        isStalled({
          statusCode: "DISPATCHED",
          dwellSeconds: thresholdSeconds - 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "DISPATCHED",
          dwellSeconds: thresholdSeconds,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "DISPATCHED",
          dwellSeconds: thresholdSeconds + 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(true);
    });

    it("non-SCHEDULED: IN_PROGRESS stalls iff dwellSeconds is > threshold (below, equal, above)", () => {
      const thresholdSeconds = STALLED_THRESHOLDS_SECONDS.IN_PROGRESS;

      expect(
        isStalled({
          statusCode: "IN_PROGRESS",
          dwellSeconds: thresholdSeconds - 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "IN_PROGRESS",
          dwellSeconds: thresholdSeconds,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "IN_PROGRESS",
          dwellSeconds: thresholdSeconds + 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(true);
    });

    it("non-SCHEDULED: ON_HOLD stalls iff dwellSeconds is > threshold (below, equal, above)", () => {
      const thresholdSeconds = STALLED_THRESHOLDS_SECONDS.ON_HOLD;

      expect(
        isStalled({
          statusCode: "ON_HOLD",
          dwellSeconds: thresholdSeconds - 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "ON_HOLD",
          dwellSeconds: thresholdSeconds,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      expect(
        isStalled({
          statusCode: "ON_HOLD",
          dwellSeconds: thresholdSeconds + 1,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(true);
    });

    it("SCHEDULED: stalls when scheduledStartAt is more than threshold in the past AND checkInCount === 0 (below, equal, above)", () => {
      const thresholdSeconds = STALLED_THRESHOLDS_SECONDS.SCHEDULED;

      // secondsPastStart = (nowMs - scheduledStartAt.getTime()) / 1000
      // below threshold
      const scheduledStartBelow = new Date(nowMs - (thresholdSeconds - 1) * 1000);
      expect(
        isStalled({
          statusCode: "SCHEDULED",
          dwellSeconds: 0,
          scheduledStartAt: scheduledStartBelow,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      // exactly equal to threshold -> not stalled because predicate uses strict '>'
      const scheduledStartEqual = new Date(nowMs - thresholdSeconds * 1000);
      expect(
        isStalled({
          statusCode: "SCHEDULED",
          dwellSeconds: 0,
          scheduledStartAt: scheduledStartEqual,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);

      // above threshold
      const scheduledStartAbove = new Date(nowMs - (thresholdSeconds + 1) * 1000);
      expect(
        isStalled({
          statusCode: "SCHEDULED",
          dwellSeconds: 0,
          scheduledStartAt: scheduledStartAbove,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(true);
    });

    it("SCHEDULED: same past-threshold scheduledStartAt but checkInCount === 1 does NOT stall", () => {
      const thresholdSeconds = STALLED_THRESHOLDS_SECONDS.SCHEDULED;
      const scheduledStartAbove = new Date(nowMs - (thresholdSeconds + 1) * 1000);

      expect(
        isStalled({
          statusCode: "SCHEDULED",
          dwellSeconds: 0,
          scheduledStartAt: scheduledStartAbove,
          checkInCount: 1,
          nowMs,
        }),
      ).toBe(false);
    });

    it("SCHEDULED: null scheduledStartAt is NOT stalled", () => {
      expect(
        isStalled({
          statusCode: "SCHEDULED",
          dwellSeconds: STALLED_THRESHOLDS_SECONDS.SCHEDULED + 9999,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);
    });

    it("statusCode with no threshold entry is NOT stalled", () => {
      expect(
        isStalled({
          statusCode: "COMPLETED",
          dwellSeconds: 999999,
          scheduledStartAt: null,
          checkInCount: 0,
          nowMs,
        }),
      ).toBe(false);
    });
  });
});
