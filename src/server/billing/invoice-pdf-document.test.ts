import zlib from "node:zlib";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { InvoiceDocument } from "@/server/billing/invoice-pdf-document";
import type { InvoicePdfData } from "@/server/billing/invoice-pdf-data";

// ★ The banked note says a PDF change cannot be verified from a script harness. That holds for
// renderClientInvoicePdf (server-only + DB). It does NOT hold for InvoiceDocument: its only
// runtime imports are @react-pdf and the pure @/lib formatters, because the invoice-pdf-data
// import is TYPE-ONLY and erased. So it renders here against a fixture, with no database.
//
// ★ Text lives as SINGLE-byte hex glyph codes inside FlateDecode'd streams, with kerning numbers
// BETWEEN the tokens: "[<...Seed > 100 <T> 60 <enant>] TJ". A plain grep over the bytes finds
// NOTHING, so every "must not appear" assertion passes vacuously against a broken extractor.
// The POSITIVE assertions below are what give the negative ones meaning. Do not remove them.

const FIXTURE: InvoicePdfData = {
  hasUndisclosedMarkup: false,
  invoiceLabel: "INV-000005",
  invoiceLabelIsFallback: false,
  status: "sent",
  jobNumber: 42,
  issuedAt: new Date("2026-08-18T19:04:05Z"),
  dueAt: new Date("2026-09-17T19:04:05Z"),
  paymentTermsDays: 30,
  currency: "USD",
  company: {
    name: "Phase 9 Seed Tenant",
    legalName: "Phase 9 Seed Tenant LLC",
    addressLine1: "500 Industrial Way",
    addressLine2: null,
    city: "Bellport",
    stateProvince: "NY",
    postalCode: "11713",
    country: "US",
    remitTo: "Remit to: Phase 9 Seed Tenant LLC",
    phone: "5551234567",
    email: "ar@example.com",
  },
  billTo: {
    clientName: "Acme Facilities, Inc.",
    locationName: "Store #118",
    addressLine1: "77 Main Street",
    addressLine2: null,
    city: "Patchogue",
    stateProvince: "NY",
    postalCode: "11772",
    country: "US",
  },
  lines: [
    {
      lineNumber: 1,
      description: "Snow removal — Jan event",
      quantity: "1",
      unit: "visit",
      unitPrice: "1200.00",
      extendedAmount: "1200.00",
      taxAmount: "0.00",
    },
  ],
  subtotal: "1200.00",
  taxTotal: "0.00",
  total: "1200.00",
} as InvoicePdfData;

/** Every text run in the document, in order. */
function extractTextRuns(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  let raw = "";
  let i = 0;
  for (;;) {
    const s = buf.indexOf("stream", i);
    if (s === -1) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf("endstream", start);
    if (e === -1) break;
    try {
      raw += zlib.inflateSync(buf.subarray(start, e)).toString("latin1") + "\n";
    } catch {
      // not a deflate stream (fonts, metadata) — skip
    }
    i = e + 9;
  }

  const unhex = (hex: string): string => {
    let out = "";
    for (let k = 0; k + 1 < hex.length; k += 2) out += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
    return out;
  };

  const runs: string[] = [];
  for (const m of raw.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    let run = "";
    for (const t of m[1].matchAll(/<([0-9A-Fa-f]+)>/g)) run += unhex(t[1]);
    if (run) runs.push(run);
  }
  return runs;
}

describe("InvoiceDocument", () => {
  let text: string;
  let runs: string[];

  beforeAll(async () => {
    const element = createElement(InvoiceDocument, { data: FIXTURE }) as unknown as ReactElement<DocumentProps>;
    const bytes = await renderToBuffer(element);
    runs = extractTextRuns(bytes);
    text = runs.join("\n");
  });

  it("extracts real text — the guard that makes every negative assertion meaningful", () => {
    expect(runs.length).toBeGreaterThan(20);
    expect(text).toContain("INVOICE");
  });

  it.each([
    ["the total with thousands separators", "$1,200.00"],
    ["the issue date in the shared format", "Aug 18, 2026"],
    ["the due date in the shared format", "Sep 17, 2026"],
    ["the formatted company phone", "(555) 123-4567"],
    ["the company city line", "Bellport, NY 11713"],
    ["the bill-to city line", "Patchogue, NY 11772"],
    ["the invoice label", "INV-000005"],
    ["the client name", "Acme Facilities, Inc."],
  ])("prints %s", (_label, expected) => {
    expect(text).toContain(expected);
  });

  // cityLine once delegated with a spread, so the caller's real addressLine1 overrode the null
  // and the STREET was returned as the city line: printed twice, city/state/postal gone.
  // tsc, lint and next build were all green while this was broken.
  it("prints each street line exactly once", () => {
    const street = runs.join("").split("Industrial Way").length - 1;
    expect(street).toBe(1);
  });

  it.each([
    ["unseparated money", "$1200.00"],
    ["a host-locale date", "8/18/2026"],
    ["raw phone digits", "5551234567"],
  ])("never prints %s", (_label, forbidden) => {
    expect(text).not.toContain(forbidden);
  });

  // OQ-6: markup is the margin and is INTERNAL-ONLY. It must never reach a client document.
  it.each([["markup"], ["Markup"], ["MARKUP"]])("never leaks %s (OQ-6)", (forbidden) => {
    expect(text).not.toContain(forbidden);
  });
});
