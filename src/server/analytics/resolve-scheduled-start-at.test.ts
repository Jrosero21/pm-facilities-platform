import { describe, expect, it } from "vitest";

import { resolveScheduledStartAt } from "@/server/analytics/resolve-scheduled-start-at";

describe("resolveScheduledStartAt", () => {
  it("returns the job-level scheduledStartAt when set, even if assignments contain earlier dates", () => {
    const jobDate = new Date("2026-01-02T10:00:00.000Z");
    const assignments = [
      { scheduledStartAt: new Date("2026-01-01T09:00:00.000Z") },
      { scheduledStartAt: new Date("2026-01-02T09:59:59.000Z") },
      { scheduledStartAt: null },
    ] as const;

    expect(resolveScheduledStartAt({ scheduledStartAt: jobDate }, assignments)).toEqual(jobDate);
  });

  it("returns the earliest non-null assignment scheduledStartAt when job-level is null (non-chronological input)", () => {
    const assignments = [
      { scheduledStartAt: new Date("2026-01-10T00:00:00.000Z") },
      { scheduledStartAt: null },
      { scheduledStartAt: new Date("2026-01-05T12:00:00.000Z") },
      { scheduledStartAt: new Date("2026-01-06T00:00:00.000Z") },
    ] as const;

    expect(resolveScheduledStartAt({ scheduledStartAt: null }, assignments)).toEqual(
      new Date("2026-01-05T12:00:00.000Z"),
    );
  });

  it("returns the earliest non-null assignment scheduledStartAt when assignments include a mix of null and non-null values", () => {
    const assignments = [
      { scheduledStartAt: null },
      { scheduledStartAt: new Date("2026-02-01T08:00:00.000Z") },
      { scheduledStartAt: null },
      { scheduledStartAt: new Date("2026-01-31T23:59:59.000Z") },
    ] as const;

    expect(resolveScheduledStartAt({ scheduledStartAt: null }, assignments)).toEqual(
      new Date("2026-01-31T23:59:59.000Z"),
    );
  });

  it("returns null when all assignments have scheduledStartAt = null", () => {
    const assignments = [
      { scheduledStartAt: null },
      { scheduledStartAt: null },
    ] as const;

    expect(resolveScheduledStartAt({ scheduledStartAt: null }, assignments)).toBeNull();
  });

  it("returns null when assignments array is empty", () => {
    const assignments: ReadonlyArray<{ scheduledStartAt: Date | null }> = [];

    expect(resolveScheduledStartAt({ scheduledStartAt: null }, assignments)).toBeNull();
  });

  it("chooses the strictly earlier date using < comparison (and not the later/equal one)", () => {
    const assignments = [
      { scheduledStartAt: new Date("2026-03-01T00:00:00.000Z") },
      { scheduledStartAt: new Date("2026-03-01T00:00:00.000Z") },
      { scheduledStartAt: new Date("2026-02-28T23:59:59.999Z") },
      { scheduledStartAt: new Date("2026-03-01T00:00:00.000Z") },
    ] as const;

    // The earliest strictly earlier than 2026-03-01 is 2026-02-28T23:59:59.999Z.
    expect(resolveScheduledStartAt({ scheduledStartAt: null }, assignments)).toEqual(
      new Date("2026-02-28T23:59:59.999Z"),
    );
  });
});
