// Invoice PDF render check — the only gate that inspects the ACTUAL PDF BYTES.
//
// ★ The banked note says a PDF change cannot be verified from the script harness. That is true
// of renderClientInvoicePdf, which imports server-only and the DB. It is NOT true of
// InvoiceDocument: its only runtime imports are @react-pdf and the pure @/lib formatters (the
// invoice-pdf-data import is TYPE-ONLY, erased at compile time). So it renders under plain tsx
// with NO --conditions flag, against a hand-built fixture and no database.
//
// ★ Text is stored as SINGLE-byte hex glyph codes inside FlateDecode'd streams, with kerning
// numbers BETWEEN the tokens ("[<...Seed > 100 <T> 60 <enant>] TJ"), so a plain grep over the
// bytes finds nothing and every "absent" assertion passes vacuously. The POSITIVE controls below
// are what make the negative ones mean anything — do not remove them.
//
// Run: node_modules/.bin/tsx scripts/check-invoice-pdf.ts
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import zlib from "node:zlib";
import { InvoiceDocument } from "../src/server/billing/invoice-pdf-document";
import type { InvoicePdfData } from "../src/server/billing/invoice-pdf-data";

const data: InvoicePdfData = {
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
    name: "Phase 9 Seed Tenant", legalName: "Phase 9 Seed Tenant LLC",
    addressLine1: "500 Industrial Way", addressLine2: null,
    city: "Bellport", stateProvince: "NY", postalCode: "11713", country: "US",
    remitTo: "Remit to: Phase 9 Seed Tenant LLC", phone: "5551234567", email: "ar@example.com",
  },
  billTo: {
    clientName: "Acme Facilities, Inc.", locationName: "Store #118",
    addressLine1: "77 Main Street", addressLine2: null,
    city: "Patchogue", stateProvince: "NY", postalCode: "11772", country: "US",
  },
  lines: [
    { lineNumber: 1, description: "Snow removal — Jan event", quantity: "1", unit: "visit", unitPrice: "1200.00", extendedAmount: "1200.00", taxAmount: "0.00" },
  ],
  subtotal: "1200.00", taxTotal: "0.00", total: "1200.00",
} as InvoicePdfData;

const el = createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>;
const bytes = await renderToBuffer(el);
console.log(`RENDERED ${bytes.byteLength} bytes`);

// --- extract text: inflate streams, then rebuild each "[ <hex> kern <hex> ] TJ" run ---
// Glyph codes are SINGLE-byte hex, and kerning numbers sit BETWEEN the hex tokens, so the
// tokens of one run must be concatenated with the numbers dropped.
const buf = Buffer.from(bytes);
let raw = "";
let i = 0;
while (true) {
  const s = buf.indexOf("stream", i);
  if (s === -1) break;
  let start = s + 6;
  if (buf[start] === 0x0d) start++;
  if (buf[start] === 0x0a) start++;
  const e = buf.indexOf("endstream", start);
  if (e === -1) break;
  try { raw += zlib.inflateSync(buf.subarray(start, e)).toString("latin1") + "\n"; } catch { /* not deflate */ }
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
for (const m of raw.matchAll(/\(((?:\\.|[^)\\])*)\)\s*Tj/g)) if (m[1]) runs.push(m[1]);
const decoded = runs.join("\n");
console.log(`EXTRACTED ${runs.length} text runs, ${decoded.length} chars`);

const must = ["$1,200.00", "Aug 18, 2026", "Sep 17, 2026", "(555) 123-4567", "Bellport, NY 11713", "Patchogue, NY 11772", "INV-000005", "Acme Facilities"];
const mustNot = ["$1200.00", "8/18/2026", "5551234567", "markup", "Markup"];
let bad = 0;
for (const m of must)    { const ok = decoded.includes(m); if (!ok) bad++; console.log(`  ${ok ? "PRESENT " : "MISSING "} ${JSON.stringify(m)}`); }
for (const m of mustNot) { const hit = decoded.includes(m); if (hit) bad++;  console.log(`  ${hit ? "LEAKED  " : "absent  "} ${JSON.stringify(m)}`); }
console.log(bad === 0 ? "PDF OK" : `FAIL ${bad} assertion(s)`);
