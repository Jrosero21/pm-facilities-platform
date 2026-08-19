import process from "node:process";

import { formatPercentValue, formatRatioAsPercent } from "../src/lib/percent";

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
     
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    process.exit(1);
  }
}

// 1) formatPercentValue(value: string | null | undefined)
assertEqual(formatPercentValue("15.00"), "15%", "formatPercentValue('15.00')");
assertEqual(formatPercentValue("12.50"), "12.5%", "formatPercentValue('12.50')");
assertEqual(formatPercentValue("0.00"), "0%", "formatPercentValue('0.00')");
assertEqual(formatPercentValue("7"), "7%", "formatPercentValue('7')");
assertEqual(formatPercentValue("100.00"), "100%", "formatPercentValue('100.00')");
assertEqual(formatPercentValue("-2.50"), "-2.5%", "formatPercentValue('-2.50')");
assertEqual(formatPercentValue("0.10"), "0.1%", "formatPercentValue('0.10')");
assertEqual(formatPercentValue(null), "—", "formatPercentValue(null)");
assertEqual(formatPercentValue(undefined), "—", "formatPercentValue(undefined)");
assertEqual(formatPercentValue(""), "—", "formatPercentValue('')");

let typeErrorCaught = false;
try {
  formatPercentValue("abc");
} catch (err) {
  if (err instanceof TypeError) typeErrorCaught = true;
}
if (!typeErrorCaught) {
   
  console.error("FAIL: formatPercentValue('abc') did not throw TypeError");
  process.exit(1);
}

// 2) formatRatioAsPercent(ratio: number | null | undefined, decimals?: number)
assertEqual(formatRatioAsPercent(0.876), "88%", "formatRatioAsPercent(0.876)");
assertEqual(formatRatioAsPercent(0.5), "50%", "formatRatioAsPercent(0.5)");
assertEqual(formatRatioAsPercent(1), "100%", "formatRatioAsPercent(1)");
assertEqual(formatRatioAsPercent(0), "0%", "formatRatioAsPercent(0)");
assertEqual(formatRatioAsPercent(0.8765, 2), "87.65%", "formatRatioAsPercent(0.8765, 2)");
assertEqual(formatRatioAsPercent(0.125, 1), "12.5%", "formatRatioAsPercent(0.125, 1)");
assertEqual(formatRatioAsPercent(0.5, 2), "50.00%", "formatRatioAsPercent(0.5, 2)");
assertEqual(formatRatioAsPercent(null), "—", "formatRatioAsPercent(null)");
assertEqual(formatRatioAsPercent(undefined), "—", "formatRatioAsPercent(undefined)");

let rangeErrorCaught1 = false;
try {
  // negative decimals
  formatRatioAsPercent(0.5, -1);
} catch (err) {
  if (err instanceof RangeError) rangeErrorCaught1 = true;
}
if (!rangeErrorCaught1) {
   
  console.error("FAIL: formatRatioAsPercent(..., -1) did not throw RangeError");
  process.exit(1);
}

let rangeErrorCaught2 = false;
try {
  // non-integer decimals
  formatRatioAsPercent(0.5, 1.5);
} catch (err) {
  if (err instanceof RangeError) rangeErrorCaught2 = true;
}
if (!rangeErrorCaught2) {
   
  console.error("FAIL: formatRatioAsPercent(..., 1.5) did not throw RangeError");
  process.exit(1);
}

 
console.log("PERCENT OK");
