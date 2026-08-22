import { describe, expect, it } from "vitest";
import {
  MULTI_ZONE_STATES,
  US_STATE_TIMEZONES,
  isMultiZoneState,
  timezoneForState,
} from "@/lib/us-state-timezones";

describe("timezoneForState — the states actually in the data", () => {
  // Every client_location in local pm and in prod is NY or CA. Both are single-zone, so the
  // backfill is exact for the data in hand, not an approximation.
  it("maps NY and CA exactly", () => {
    expect(timezoneForState("NY")).toBe("America/New_York");
    expect(timezoneForState("CA")).toBe("America/Los_Angeles");
  });

  it("treats those two as unambiguous", () => {
    expect(isMultiZoneState("NY")).toBe(false);
    expect(isMultiZoneState("CA")).toBe(false);
  });
});

describe("timezoneForState — input handling", () => {
  it("is case-insensitive and trims", () => {
    expect(timezoneForState("ny")).toBe("America/New_York");
    expect(timezoneForState("  Ca  ")).toBe("America/Los_Angeles");
  });

  // ★ null, NOT a default. A guess written into the database as though it were looked up is worse
  // than an honest absence: the display layer can label a fallback, but once a wrong value is
  // stored nothing downstream can tell it from a fact an operator confirmed.
  it("returns null for anything unrecognised rather than guessing", () => {
    for (const input of [null, undefined, "", "   ", "ZZ", "ON", "Ontario", "12"]) {
      expect(timezoneForState(input)).toBeNull();
    }
  });
});

describe("multi-zone states are flagged, not hidden", () => {
  it("flags the states whose mapping is a dominant-zone approximation", () => {
    for (const state of ["TX", "FL", "ID", "TN", "KS", "OR", "MI", "AK"]) {
      expect(isMultiZoneState(state), state).toBe(true);
      // Flagged states still resolve — the flag is advice to the caller, not a refusal.
      expect(timezoneForState(state), state).not.toBeNull();
    }
  });

  it("picks the dominant zone for the flagged states", () => {
    expect(timezoneForState("TX")).toBe("America/Chicago"); // El Paso is Mountain
    expect(timezoneForState("FL")).toBe("America/New_York"); // panhandle is Central
    expect(timezoneForState("ID")).toBe("America/Boise"); // northern panhandle is Pacific
  });

  it("maps Arizona to Phoenix — the no-DST zone, not Denver", () => {
    expect(timezoneForState("AZ")).toBe("America/Phoenix");
    expect(isMultiZoneState("AZ")).toBe(true); // Navajo Nation observes DST
  });

  it("does not flag a single-zone state", () => {
    for (const state of ["NY", "CA", "IL", "MA", "CO", "HI"]) {
      expect(isMultiZoneState(state), state).toBe(false);
    }
  });
});

describe("the map itself", () => {
  it("only contains zones this runtime's Intl can resolve", () => {
    for (const [state, tz] of Object.entries(US_STATE_TIMEZONES)) {
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz }), `${state} -> ${tz}`).not.toThrow();
    }
  });

  it("covers all 50 states plus DC", () => {
    const states = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
    expect(states).toHaveLength(51);
    for (const s of states) expect(timezoneForState(s), s).not.toBeNull();
  });

  it("every flagged multi-zone state is actually in the map", () => {
    for (const s of MULTI_ZONE_STATES) expect(US_STATE_TIMEZONES[s], s).toBeDefined();
  });
});
