import { describe, expect, it } from "vitest";

import { advanceDueDate, type PmFrequency } from "@/server/pm/recurrence";

// ── Why this file compares LOCAL wall-clock parts, not toISOString() ──────────
// date-fns addDays/addWeeks/addMonths operate on LOCAL time and preserve the
// local wall clock. Asserting on the UTC instant therefore encodes whatever
// timezone the test happens to run in: an advance that crosses a DST boundary
// keeps 10:20 LOCAL and so moves the UTC instant by an hour. Pinning the ISO
// string passes in PDT and fails in CI under TZ=UTC.
//
// ★ The preserved quantity is the local wall clock. That is what is asserted
//   here, and it holds in every timezone. See the DST test at the bottom for
//   the consequence this has for UTC-stored due dates.

type Parts = [year: number, month1: number, day: number, hour: number, minute: number];

/** Local-time Date, built from the same parts the assertions compare. */
const at = (y: number, month1: number, d: number, h: number, mi: number): Date =>
  new Date(y, month1 - 1, d, h, mi, 0, 0);

const partsOf = (d: Date): Parts => [
  d.getFullYear(),
  d.getMonth() + 1,
  d.getDate(),
  d.getHours(),
  d.getMinutes(),
];

describe("advanceDueDate", () => {
  const expectAdvance = (from: Date, freq: PmFrequency, n: number, expected: Parts): void => {
    expect(partsOf(advanceDueDate(from, freq, n))).toEqual(expected);
  };

  const start = at(2026, 1, 15, 10, 20);

  it.each<[PmFrequency, number, Parts]>([
    ["day", 1, [2026, 1, 16, 10, 20]],
    ["day", 10, [2026, 1, 25, 10, 20]],
    ["week", 1, [2026, 1, 22, 10, 20]],
    ["week", 3, [2026, 2, 5, 10, 20]],
    ["month", 1, [2026, 2, 15, 10, 20]],
    ["month", 3, [2026, 4, 15, 10, 20]],
  ])("advances by %s x%d", (freq, n, expected) => {
    expectAdvance(start, freq, n, expected);
  });

  // The module's documented defensive rule: a malformed schedule still advances
  // by one period rather than stalling or running backwards.
  it.each([0, -1, -5])("treats intervalCount %d as 1 and never goes backwards", (n) => {
    const result = advanceDueDate(start, "day", n);
    expect(partsOf(result)).toEqual([2026, 1, 16, 10, 20]);
    expect(result.getTime()).toBeGreaterThan(start.getTime());
  });

  it("floors a fractional intervalCount", () => {
    expectAdvance(start, "day", 2.9, [2026, 1, 17, 10, 20]);
    expectAdvance(start, "week", 1.9, [2026, 1, 22, 10, 20]);
    expectAdvance(start, "month", 2.9, [2026, 3, 15, 10, 20]);
  });

  // ★ The case month arithmetic gets wrong when hand-rolled: date-fns CLAMPS to
  //   the last day of the shorter month rather than overflowing into March.
  it("clamps a month advance to the end of a shorter month", () => {
    expectAdvance(at(2026, 1, 31, 10, 20), "month", 1, [2026, 2, 28, 10, 20]);
    expectAdvance(at(2024, 1, 31, 10, 20), "month", 1, [2024, 2, 29, 10, 20]); // leap year
  });

  it("advances from a leap day without clamping", () => {
    expectAdvance(at(2024, 2, 29, 10, 20), "month", 1, [2024, 3, 29, 10, 20]);
    expectAdvance(at(2024, 2, 29, 10, 20), "month", 12, [2025, 2, 28, 10, 20]);
  });

  // ★ DST: the local wall clock is preserved, so in a DST-observing zone the
  //   UTC instant of a due date MOVES BY AN HOUR across the transition. A due
  //   date stored and compared in UTC will drift; a due date meant as "10:20
  //   local, monthly" is correct. Which of those PM intends is a product
  //   question — this test pins only what the code does.
  it("preserves the local wall clock across a spring-forward transition", () => {
    const beforeDst = at(2026, 2, 15, 10, 20); // US DST begins 2026-03-08
    const result = advanceDueDate(beforeDst, "month", 1);

    expect(partsOf(result)).toEqual([2026, 3, 15, 10, 20]);

    // The elapsed UTC milliseconds are therefore NOT a whole number of days in
    // a DST-observing zone, and ARE in a zone without DST. Asserting either
    // would pin the test machine's timezone, which is the bug this file was
    // rewritten to remove — so the wall clock above is the whole assertion.
  });

  it("returns a Date", () => {
    expect(advanceDueDate(start, "day", 1)).toBeInstanceOf(Date);
  });
});
