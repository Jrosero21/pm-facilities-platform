import { describe, expect, it } from "vitest";

import {
  DISPATCH_STUCK_THRESHOLDS_SECONDS,
  dispatchStuckThresholdSeconds,
  isDispatchStuck,
  type DispatchStuckInput,
} from "./dispatch-sla-rules";

describe("dispatchStuckThresholdSeconds", () => {
  it("returns the exact threshold seconds for tracked (status, priority) pairs", () => {
    expect(dispatchStuckThresholdSeconds("SENT", "EMERGENCY")).toBe(
      DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.EMERGENCY,
    );
    expect(dispatchStuckThresholdSeconds("SENT", "URGENT")).toBe(
      DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.URGENT,
    );
    expect(dispatchStuckThresholdSeconds("SENT", "HIGH")).toBe(
      DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.HIGH,
    );
    expect(dispatchStuckThresholdSeconds("SENT", "ROUTINE")).toBe(
      DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.ROUTINE,
    );
    expect(dispatchStuckThresholdSeconds("SENT", "SCHEDULED")).toBe(
      DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.SCHEDULED,
    );
  });

  it("returns undefined for an untracked statusCode", () => {
    expect(dispatchStuckThresholdSeconds("ACCEPTED", "EMERGENCY")).toBeUndefined();
  });

  it("falls back to DEFAULT when priorityCode is null", () => {
    expect(dispatchStuckThresholdSeconds("SENT", null)).toBe(
      DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.DEFAULT,
    );
  });

  it("falls back to DEFAULT when priorityCode is an unmapped code", () => {
    expect(dispatchStuckThresholdSeconds("SENT", "NOT_A_REAL_PRIORITY")).toBe(
      DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.DEFAULT,
    );
  });
});

describe("isDispatchStuck", () => {
  it("is false for dwellSeconds below the threshold", () => {
    const threshold = DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.URGENT;
    const input: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: "URGENT",
      dwellSeconds: threshold - 1,
    };

    expect(isDispatchStuck(input)).toBe(false);
  });

  it("is false when dwellSeconds is exactly equal to the threshold (strictly greater required)", () => {
    const threshold = DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.HIGH;
    const input: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: "HIGH",
      dwellSeconds: threshold,
    };

    expect(isDispatchStuck(input)).toBe(false);
  });

  it("is true when dwellSeconds is one above the threshold", () => {
    const threshold = DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.ROUTINE;
    const input: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: "ROUTINE",
      dwellSeconds: threshold + 1,
    };

    expect(isDispatchStuck(input)).toBe(true);
  });

  it("returns false for an untracked statusCode regardless of dwellSeconds", () => {
    const input: DispatchStuckInput = {
      statusCode: "ACCEPTED",
      priorityCode: "EMERGENCY",
      dwellSeconds: 999999,
    };

    expect(isDispatchStuck(input)).toBe(false);
  });

  it("uses DEFAULT threshold when priorityCode is null", () => {
    const threshold = DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.DEFAULT;

    const below: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: null,
      dwellSeconds: threshold - 1,
    };
    const equal: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: null,
      dwellSeconds: threshold,
    };
    const above: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: null,
      dwellSeconds: threshold + 1,
    };

    expect(isDispatchStuck(below)).toBe(false);
    expect(isDispatchStuck(equal)).toBe(false);
    expect(isDispatchStuck(above)).toBe(true);
  });

  it("uses DEFAULT threshold when priorityCode is an unmapped code", () => {
    const threshold = DISPATCH_STUCK_THRESHOLDS_SECONDS.SENT.DEFAULT;

    const below: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: "NOT_A_REAL_PRIORITY",
      dwellSeconds: threshold - 1,
    };
    const equal: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: "NOT_A_REAL_PRIORITY",
      dwellSeconds: threshold,
    };
    const above: DispatchStuckInput = {
      statusCode: "SENT",
      priorityCode: "NOT_A_REAL_PRIORITY",
      dwellSeconds: threshold + 1,
    };

    expect(isDispatchStuck(below)).toBe(false);
    expect(isDispatchStuck(equal)).toBe(false);
    expect(isDispatchStuck(above)).toBe(true);
  });
});
