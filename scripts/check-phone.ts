import { formatPhone } from "../src/lib/phone";

const cases: Array<[string | null | undefined, string]> = [
  ["5551234567", "(555) 123-4567"],
  ["555-123-4567", "(555) 123-4567"],
  ["(555) 123-4567", "(555) 123-4567"],
  ["15551234567", "+1 (555) 123-4567"],
  ["+1 555 123 4567", "+1 (555) 123-4567"],
  ["5551234567 x89", "(555) 123-4567 x89"],
  ["555-123-4567 ext 200", "(555) 123-4567 x200"],
  ["+44 20 7946 0958", "+44 20 7946 0958"],
  ["  555 1234  ", "555 1234"],
  [null, "—"],
  [undefined, "—"],
  ["", "—"],
];

for (const [input, expected] of cases) {
  const actual = formatPhone(input);
  if (actual !== expected) {
    // FAIL with the failing case.
    console.log("FAIL", { input, expected, actual });
    process.exit(1);
  }
}

console.log("PHONE OK");
