import process from "node:process";

import { formatMoney } from "../src/lib/money";

function assertEqual(actual: string, expected: string, input: string): void {
  if (actual !== expected) {
     
    console.log(`FAIL case=${JSON.stringify(input)} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
    process.exit(1);
  }
}

function assertThrowsTypeError(fn: () => unknown, input: string): void {
  try {
    fn();
     
    console.log(`FAIL case=${JSON.stringify(input)} expected TypeError but none thrown`);
    process.exit(1);
  } catch (e: unknown) {
    if (!(e instanceof TypeError)) {
       
      console.log(`FAIL case=${JSON.stringify(input)} expected TypeError but got ${Object.prototype.toString.call(e)}`);
      process.exit(1);
    }
  }
}

const cases: Array<[string | null | undefined, string]> = [
  ["1234.56", "$1,234.56"],
  ["0.00", "$0.00"],
  ["12345.60", "$12,345.60"],
  ["-1234.56", "-$1,234.56"],
  ["1000000", "$1,000,000.00"],
  ["1234.5", "$1,234.50"],
  ["1234.567", "$1,234.57"],
  ["-0.001", "$0.00"],

  // HALF_UP tie cases (round to 2 decimals by going away from zero on ties)
  ["0.005", "$0.01"],
  ["1.005", "$1.01"],
  ["1234.565", "$1,234.57"],
  ["2.675", "$2.68"],
  ["-0.005", "-$0.01"],
  ["-0.004", "$0.00"],

  [null, "—"],
  [undefined, "—"],
  ["", "—"],
  ["   ", "—"],
];

for (const [input, expected] of cases) {
  const actual = formatMoney(input);
  assertEqual(actual, expected, String(input));
}

assertThrowsTypeError(() => formatMoney("abc"), "abc");

 
console.log("MONEY OK");
