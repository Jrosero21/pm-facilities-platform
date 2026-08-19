import { formatAddressLines, formatAddressOneLine, type AddressParts } from "../src/lib/address";

const expectLines = (parts: AddressParts, expected: string[]) => {
  const actual = formatAddressLines(parts);
  if (actual.length !== expected.length) {
    throw new Error(`Lines length mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`Lines element mismatch at ${i}. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
    }
  }
};

const expectOneLine = (parts: AddressParts, expected: string) => {
  const actual = formatAddressOneLine(parts);
  if (actual !== expected) {
    throw new Error(`One-line mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
};

const cases: Array<{
  name: string;
  parts: AddressParts;
  expectedLines: string[];
  expectedOneLine: string;
}> = [
  {
    name: "all fields",
    parts: {
      addressLine1: "123 Main St",
      addressLine2: "Suite 400",
      city: "Bellport",
      stateProvince: "NY",
      postalCode: "11713",
    },
    expectedLines: ["123 Main St", "Suite 400", "Bellport, NY 11713"],
    expectedOneLine: "123 Main St, Suite 400, Bellport, NY 11713",
  },
  {
    name: "no line2",
    parts: {
      addressLine1: "123 Main St",
      addressLine2: null,
      city: "Bellport",
      stateProvince: "NY",
      postalCode: "11713",
    },
    expectedLines: ["123 Main St", "Bellport, NY 11713"],
    expectedOneLine: "123 Main St, Bellport, NY 11713",
  },
  {
    name: "only city",
    parts: { addressLine1: null, addressLine2: null, city: "Bellport", stateProvince: null, postalCode: null },
    expectedLines: ["Bellport"],
    expectedOneLine: "Bellport",
  },
  {
    name: "state + postal only",
    parts: { addressLine1: null, addressLine2: null, city: null, stateProvince: "NY", postalCode: "11713" },
    expectedLines: ["NY 11713"],
    expectedOneLine: "NY 11713",
  },
  {
    name: "city + postal only (no state)",
    parts: { addressLine1: null, addressLine2: null, city: "Bellport", stateProvince: null, postalCode: "11713" },
    expectedLines: ["Bellport 11713"],
    expectedOneLine: "Bellport 11713",
  },
  {
    name: "trim spaces",
    parts: {
      addressLine1: "  123 Main St  ",
      addressLine2: null,
      city: "  Bellport ",
      stateProvince: "NY",
      postalCode: "11713",
    },
    expectedLines: ["123 Main St", "Bellport, NY 11713"],
    expectedOneLine: "123 Main St, Bellport, NY 11713",
  },
  {
    name: "all nulls",
    parts: { addressLine1: null, addressLine2: null, city: null, stateProvince: null, postalCode: null },
    expectedLines: [],
    expectedOneLine: "",
  },
  {
    name: "blank strings treated as empty",
    parts: { addressLine1: "", addressLine2: "   ", city: null, stateProvince: null, postalCode: null },
    expectedLines: [],
    expectedOneLine: "",
  },
];

try {
  for (const c of cases) {
    expectLines(c.parts, c.expectedLines);
    expectOneLine(c.parts, c.expectedOneLine);
  }
  // single success line
  console.log("ADDRESS OK");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`FAIL: ${msg}`);
  process.exit(1);
}
