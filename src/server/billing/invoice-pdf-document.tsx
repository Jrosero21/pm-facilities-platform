import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoicePdfBillTo, InvoicePdfCompany, InvoicePdfData } from "@/server/billing/invoice-pdf-data";
import { formatAddressLines } from "@/lib/address";
import { formatDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";

// ── invoice-pdf batch 2 — THE INVOICE DOCUMENT (layout only) ──────────────────────────
// A pure @react-pdf component over InvoicePdfData. NO db, NO fetch, NO computation: every money
// value arrives pre-computed (writer-owned by recalculateClientInvoiceTotals) and is printed as the
// decimal string it already is — no float round-trip, no re-derivation.
//
// ★★ It is STRUCTURALLY IMPOSSIBLE to print markup here: InvoicePdfData has no markup fields
// (see invoice-pdf-data.ts). This file must never accept a raw invoice row. Print `total` only.
//
// No custom fonts — the built-in Helvetica avoids shipping font binaries. No logo (deferred D1).

const C = {
  ink: "#111827",
  muted: "#6B7280",
  line: "#E5E7EB",
  band: "#F9FAFB",
};

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: C.ink, fontFamily: "Helvetica" },

  // header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyLine: { fontSize: 9, color: C.muted, lineHeight: 1.45 },
  invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right", letterSpacing: 1 },
  invoiceLabel: { fontSize: 11, textAlign: "right", marginTop: 2 },
  fallbackNote: { fontSize: 7.5, color: C.muted, textAlign: "right", marginTop: 2 },

  rule: { borderBottomWidth: 1, borderBottomColor: C.line, marginTop: 16, marginBottom: 16 },

  // meta + bill-to
  cols: { flexDirection: "row", justifyContent: "space-between" },
  col: { width: "48%" },
  sectionLabel: { fontSize: 7.5, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 5 },
  billToName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  bodyLine: { fontSize: 9, lineHeight: 1.5 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  metaKey: { fontSize: 9, color: C.muted },
  metaVal: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  // table
  tHead: { flexDirection: "row", backgroundColor: C.band, paddingVertical: 6, paddingHorizontal: 6, marginTop: 22 },
  tRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  th: { fontSize: 7.5, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  td: { fontSize: 9 },
  cNum: { width: "6%" },
  cDesc: { width: "44%", paddingRight: 8 },
  cQty: { width: "12%", textAlign: "right" },
  cPrice: { width: "13%", textAlign: "right" },
  cTax: { width: "11%", textAlign: "right" },
  cAmt: { width: "14%", textAlign: "right" },

  empty: { fontSize: 9, color: C.muted, paddingVertical: 14, textAlign: "center" },

  // totals
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: "42%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandRow: {
    flexDirection: "row", justifyContent: "space-between",
    borderTopWidth: 1.5, borderTopColor: C.ink, marginTop: 6, paddingTop: 7,
  },
  grandLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandVal: { fontSize: 13, fontFamily: "Helvetica-Bold" },

  // remit + footer
  remit: { marginTop: 26, padding: 11, backgroundColor: C.band },
  footer: {
    position: "absolute", bottom: 26, left: 44, right: 44,
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 7,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: C.muted },
});

/** "City, ST 12345" from parts, skipping the missing ones. Empty string when nothing is set.
 *  Delegates to the shared address formatter so the PDF and the screens cannot drift. */
function cityLine(p: { city: string | null; stateProvince: string | null; postalCode: string | null }): string {
  // Built field-by-field, NOT by spreading `p`: callers pass the whole company / billTo object,
  // whose real addressLine1 would override a spread-in null and make this return the STREET line.
  // The declared parameter type hides that from tsc, so only a rendered PDF catches it.
  return formatAddressLines({
    addressLine1: null,
    addressLine2: null,
    city: p.city,
    stateProvince: p.stateProvince,
    postalCode: p.postalCode,
  })[0] ?? "";
}

/** Rendered in the SITE's zone — deterministic across machines (it is an explicit zone, not the
 *  host's) and it prints the day the client actually keeps, unlike the previous UTC basis which
 *  rolled over mid-evening Pacific.
 *  "n/a" (not the em dash the screens use) is kept deliberately: this string reaches a client. */
function fmtDate(d: Date | null, timeZone: string): string {
  return d ? formatDate(d, timeZone) : "n/a";
}

// USD goes through the shared formatter (thousands separators, negatives as -$X). Any other
// currency keeps the plain "CUR 1234.56" form — formatMoney is USD-only by design.
const money = (currency: string, amount: string) =>
  currency === "USD" ? formatMoney(amount) : `${currency} ${amount}`;

function CompanyBlock({ company }: { company: InvoicePdfCompany }) {
  const line2 = cityLine(company);
  return (
    <View style={{ width: "55%" }}>
      <Text style={styles.companyName}>{company.legalName ?? company.name}</Text>
      {/* When a legal name is set, keep the trading name visible underneath. */}
      {company.legalName && company.legalName !== company.name ? (
        <Text style={styles.companyLine}>{company.name}</Text>
      ) : null}
      {company.addressLine1 ? <Text style={styles.companyLine}>{company.addressLine1}</Text> : null}
      {company.addressLine2 ? <Text style={styles.companyLine}>{company.addressLine2}</Text> : null}
      {line2 ? <Text style={styles.companyLine}>{line2}</Text> : null}
      {company.phone ? <Text style={styles.companyLine}>{formatPhone(company.phone)}</Text> : null}
      {company.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
    </View>
  );
}

function BillToBlock({ billTo }: { billTo: InvoicePdfBillTo }) {
  const line2 = cityLine(billTo);
  return (
    <View style={styles.col}>
      <Text style={styles.sectionLabel}>BILL TO</Text>
      <Text style={styles.billToName}>{billTo.clientName}</Text>
      {billTo.locationName ? <Text style={styles.bodyLine}>{billTo.locationName}</Text> : null}
      {billTo.addressLine1 ? <Text style={styles.bodyLine}>{billTo.addressLine1}</Text> : null}
      {billTo.addressLine2 ? <Text style={styles.bodyLine}>{billTo.addressLine2}</Text> : null}
      {line2 ? <Text style={styles.bodyLine}>{line2}</Text> : null}
    </View>
  );
}

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const terms = data.paymentTermsDays != null ? `Net ${data.paymentTermsDays}` : "n/a";

  return (
    <Document
      title={`Invoice ${data.invoiceLabel}`}
      author={data.company.legalName ?? data.company.name}
      subject={`Invoice ${data.invoiceLabel} for ${data.billTo.clientName}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <CompanyBlock company={data.company} />
          <View style={{ width: "40%" }}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceLabel}>{data.invoiceLabel}</Text>
            {data.invoiceLabelIsFallback ? (
              <Text style={styles.fallbackNote}>(no invoice number assigned)</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.cols}>
          <BillToBlock billTo={data.billTo} />
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Issued</Text>
              <Text style={styles.metaVal}>{fmtDate(data.issuedAt, data.siteTimeZone)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Due</Text>
              <Text style={styles.metaVal}>{fmtDate(data.dueAt, data.siteTimeZone)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Terms</Text>
              <Text style={styles.metaVal}>{terms}</Text>
            </View>
            {data.jobNumber != null ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Job</Text>
                <Text style={styles.metaVal}>#{data.jobNumber}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Status</Text>
              <Text style={styles.metaVal}>{data.status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.tHead}>
          <Text style={[styles.th, styles.cNum]}>#</Text>
          <Text style={[styles.th, styles.cDesc]}>DESCRIPTION</Text>
          <Text style={[styles.th, styles.cQty]}>QTY</Text>
          <Text style={[styles.th, styles.cPrice]}>RATE</Text>
          <Text style={[styles.th, styles.cTax]}>TAX</Text>
          <Text style={[styles.th, styles.cAmt]}>AMOUNT</Text>
        </View>

        {data.lines.length === 0 ? (
          <Text style={styles.empty}>No line items.</Text>
        ) : (
          data.lines.map((l) => (
            <View key={l.lineNumber} style={styles.tRow} wrap={false}>
              <Text style={[styles.td, styles.cNum]}>{l.lineNumber}</Text>
              <Text style={[styles.td, styles.cDesc]}>{l.description}</Text>
              <Text style={[styles.td, styles.cQty]}>
                {l.quantity}
                {l.unit ? ` ${l.unit}` : ""}
              </Text>
              <Text style={[styles.td, styles.cPrice]}>{money(data.currency, l.unitPrice)}</Text>
              <Text style={[styles.td, styles.cTax]}>{money(data.currency, l.taxAmount)}</Text>
              <Text style={[styles.td, styles.cAmt]}>{money(data.currency, l.extendedAmount)}</Text>
            </View>
          ))
        )}

        {/* ★ Subtotal → Tax → Total. There is deliberately NO markup row (OQ-6): `total` already
            includes it, and the split is internal margin the client must never see. */}
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.metaKey}>Subtotal</Text>
              <Text style={styles.td}>{money(data.currency, data.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.metaKey}>Tax</Text>
              <Text style={styles.td}>{money(data.currency, data.taxTotal)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total Due</Text>
              <Text style={styles.grandVal}>{money(data.currency, data.total)}</Text>
            </View>
          </View>
        </View>

        {data.company.remitTo ? (
          <View style={styles.remit}>
            <Text style={styles.sectionLabel}>REMIT TO</Text>
            <Text style={styles.bodyLine}>{data.company.remitTo}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.invoiceLabel} · {data.billTo.clientName}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
