import process from "node:process";

import { compactAge, relativeTime } from "../src/lib/relative-time";

const now = new Date("2026-08-18T12:00:00Z");

const cases: Array<[string, string]> = [
  [
    relativeTime(new Date(now.getTime() - 30_000), now),
    "30 seconds ago",
  ],
  [
    relativeTime(new Date(now.getTime() - 45 * 60_000), now),
    "45 minutes ago",
  ],
  [
    relativeTime(new Date(now.getTime() - 3 * 60 * 60_000), now),
    "3 hours ago",
  ],
  [relativeTime(new Date(now.getTime() - 24 * 60 * 60_000), now), "yesterday"],
  [relativeTime(new Date(now.getTime() - 3 * 24 * 60 * 60_000), now), "3 days ago"],
  [
    relativeTime(new Date(now.getTime() - 60 * 24 * 60 * 60_000), now),
    "2 months ago",
  ],
  [
    relativeTime(new Date(now.getTime() - 400 * 24 * 60 * 60_000), now),
    "last year",
  ],
  [relativeTime(new Date(now.getTime() + 2 * 60 * 60_000), now), "in 2 hours"],
  [relativeTime(new Date(now.getTime() + 24 * 60 * 60_000), now), "tomorrow"],
  [relativeTime(new Date(now.getTime()), now), "now"],
];

const compactCases: Array<[string, string]> = [
  [compactAge(0), "0s"],
  [compactAge(45), "45s"],
  [compactAge(59.9), "59s"],
  [compactAge(60), "1m"],
  [compactAge(3599), "59m"],
  [compactAge(3600), "1h"],
  [compactAge(86399), "23h"],
  [compactAge(86400), "1d"],
  [compactAge(172800), "2d"],
  [compactAge(-1), "0s"],

  // Non-finite input renders unknown
  [compactAge(Number.NaN), "—"],
  [compactAge(Number.POSITIVE_INFINITY), "—"],
  [compactAge(Number.NEGATIVE_INFINITY), "—"],

  // Negative but finite input clamps to 0s
  [compactAge(-5), "0s"],
  [compactAge(0), "0s"],
];

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
     
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    process.exit(1);
  }
}

for (let i = 0; i < cases.length; i += 1) {
  const [actual, expected] = cases[i]!;
  assertEqual(actual, expected, `REL ${i + 1}`);
}

for (let i = 0; i < compactCases.length; i += 1) {
  const [actual, expected] = compactCases[i]!;
  assertEqual(actual, expected, `CMP ${i + 1}`);
}

 
console.log("RELTIME OK");
