import { describe, expect, it } from "vitest";

import {
  REDISPATCH_MAX_ATTEMPTS,
  decideRedispatchCore,
  type RedispatchCopyForward,
  type RedispatchDecision,
} from "@/server/redispatch-suggestion";

describe("decideRedispatchCore", () => {
  it("returns suggest (below max attempts) choosing the first untried vendor in rankedVendorIds", () => {
    const copyForward: RedispatchCopyForward = {
      agreedNteAmount: "123.4500",
      dispatchScope: null,
      scheduledStartAt: null,
    };

    const result = decideRedispatchCore({
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS - 1,
      triedVendorIds: new Set<string>(["v1", "v2"]),
      rankedVendorIds: ["v1", "v2", "v3", "v4"],
      copyForward,
    });

    const expected: RedispatchDecision = {
      kind: "suggest",
      vendorId: "v3",
      copyForward,
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS - 1,
    };
    expect(result).toEqual(expected);
  });

  it("returns exhausted (boundary) with reason max_attempts when attemptsSoFar equals REDISPATCH_MAX_ATTEMPTS", () => {
    const copyForward: RedispatchCopyForward = {
      agreedNteAmount: null,
      dispatchScope: "scope-1",
      scheduledStartAt: null,
    };

    const result = decideRedispatchCore({
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS,
      triedVendorIds: new Set<string>([]),
      rankedVendorIds: ["any-vendor"],
      copyForward,
    });

    expect(result).toEqual({
      kind: "exhausted",
      reason: "max_attempts",
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS,
    });
  });

  it("returns exhausted (above max attempts) with reason max_attempts", () => {
    const copyForward: RedispatchCopyForward = {
      agreedNteAmount: "0",
      dispatchScope: null,
      scheduledStartAt: null,
    };

    const result = decideRedispatchCore({
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS + 1,
      triedVendorIds: new Set<string>(["v1"]),
      rankedVendorIds: ["v1"],
      copyForward,
    });

    expect(result).toEqual({
      kind: "exhausted",
      reason: "max_attempts",
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS + 1,
    });
  });

  it("returns exhausted when every ranked vendor is already tried", () => {
    const copyForward: RedispatchCopyForward = {
      agreedNteAmount: null,
      dispatchScope: null,
      scheduledStartAt: null,
    };

    const result = decideRedispatchCore({
      attemptsSoFar: 0,
      triedVendorIds: new Set<string>(["v1", "v2"]),
      rankedVendorIds: ["v1", "v2"],
      copyForward,
    });

    expect(result).toEqual({
      kind: "exhausted",
      reason: "no_eligible_vendor",
      attemptsSoFar: 0,
    });
  });

  it("returns exhausted when rankedVendorIds is empty", () => {
    const copyForward: RedispatchCopyForward = {
      agreedNteAmount: null,
      dispatchScope: null,
      scheduledStartAt: null,
    };

    const result = decideRedispatchCore({
      attemptsSoFar: 0,
      triedVendorIds: new Set<string>([]),
      rankedVendorIds: [],
      copyForward,
    });

    expect(result).toEqual({
      kind: "exhausted",
      reason: "no_eligible_vendor",
      attemptsSoFar: 0,
    });
  });

  it("skips best-ranked vendor if already tried and chooses the next untried one", () => {
    const copyForward: RedispatchCopyForward = {
      agreedNteAmount: "999.99",
      dispatchScope: null,
      scheduledStartAt: null,
    };

    const result = decideRedispatchCore({
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS - 1,
      triedVendorIds: new Set<string>(["best"]),
      rankedVendorIds: ["best", "second", "third"],
      copyForward,
    });

    expect(result).toEqual({
      kind: "suggest",
      vendorId: "second",
      copyForward,
      attemptsSoFar: REDISPATCH_MAX_ATTEMPTS - 1,
    });
  });
});
