import { formatDate, formatDateTime } from "../src/lib/format-date";

const EM_DASH = "—";

type Case = {
  description: string;
  actual: string;
  expected: string;
};

function assertEqual(description: string, actual: string, expected: string): Case | null {
  if (actual === expected) return null;
  return { description, actual, expected };
}

const cases: Case[] = [];

// new Date('2026-08-18T19:04:05Z')
{
  const d = new Date("2026-08-18T19:04:05Z");
  cases.push(
    assertEqual(
      "formatDate: 2026-08-18T19:04:05Z",
      formatDate(d),
      "Aug 18, 2026"
    ) ??
      (null as never)
  );
  cases.pop();

  const c1 = assertEqual("formatDate: 2026-08-18T19:04:05Z", formatDate(d), "Aug 18, 2026");
  if (c1) cases.push(c1);

  const c2 = assertEqual(
    "formatDateTime: 2026-08-18T19:04:05Z",
    formatDateTime(d),
    "Aug 18, 2026, 3:04 PM"
  );
  if (c2) cases.push(c2);

  const c3 = assertEqual(
    "formatDateTime (UTC): 2026-08-18T19:04:05Z",
    formatDateTime(d, "UTC"),
    "Aug 18, 2026, 7:04 PM"
  );
  if (c3) cases.push(c3);
}

// new Date('2026-08-19T02:30:00Z')
{
  const d = new Date("2026-08-19T02:30:00Z");

  const c1 = assertEqual("formatDate: 2026-08-19T02:30:00Z", formatDate(d), "Aug 18, 2026");
  if (c1) cases.push(c1);

  const c2 = assertEqual(
    "formatDateTime: 2026-08-19T02:30:00Z",
    formatDateTime(d),
    "Aug 18, 2026, 10:30 PM"
  );
  if (c2) cases.push(c2);

  const c3 = assertEqual(
    "formatDate (UTC): 2026-08-19T02:30:00Z",
    formatDate(d, "UTC"),
    "Aug 19, 2026"
  );
  if (c3) cases.push(c3);
}

// null/undefined/invalid
const invalids: Array<Date | null | undefined> = [null, undefined, new Date("nonsense")];
for (const v of invalids) {
  const c1 = assertEqual("formatDate: null/undefined/invalid", formatDate(v), EM_DASH);
  if (c1) cases.push(c1);

  const c2 = assertEqual(
    "formatDateTime: null/undefined/invalid",
    formatDateTime(v),
    EM_DASH
  );
  if (c2) cases.push(c2);
}

if (cases.length > 0) {
  const failing = cases[0];
  // Keep output simple for CI logs.
  console.log(`FAIL: ${failing.description} actual=${JSON.stringify(failing.actual)} expected=${JSON.stringify(failing.expected)}`);
  process.exit(1);
}

console.log("DATE OK");
