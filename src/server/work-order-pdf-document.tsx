import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type {
  WorkOrderPdfCompany,
  WorkOrderPdfData,
  WorkOrderPdfSite,
} from "@/server/work-order-pdf-data";
import { formatAddressLines } from "@/lib/address";
import { formatDateTime } from "@/lib/format-date";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";

// ── vendor-WO batch 3 — THE WORK ORDER DOCUMENT (layout only) ─────────────────────────
// A pure @react-pdf component over WorkOrderPdfData. NO db, NO fetch, NO computation — the same
// contract invoice-pdf-document.tsx holds. Tokens are already substituted (batch 2) and the money
// arrives as a canonical decimal string.
//
// ★★ STRUCTURALLY IMPOSSIBLE TO PRINT CLIENT PRICE: WorkOrderPdfData carries no client money at
// all (see work-order-pdf-data.ts). The only figure available is agreedNteAmount — this vendor's
// own ceiling. This file must never accept a raw job or invoice row.
//
// Deliberately mirrors the invoice's visual language — same palette, same Helvetica, same rule and
// section-label treatment — so the two documents read as one company's paperwork rather than two
// unrelated templates. No custom fonts, no logo (D1 deferred, same as the invoice).

const C = {
  ink: "#111827",
  muted: "#6B7280",
  line: "#E5E7EB",
  band: "#F9FAFB",
  alert: "#991B1B",
};

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: C.ink, fontFamily: "Helvetica" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  companyLine: { fontSize: 9, color: C.muted, lineHeight: 1.45 },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right", letterSpacing: 1 },
  docLabel: { fontSize: 11, textAlign: "right", marginTop: 2 },

  rule: { borderBottomWidth: 1, borderBottomColor: C.line, marginTop: 16, marginBottom: 16 },

  cols: { flexDirection: "row", justifyContent: "space-between" },
  col: { width: "48%" },
  sectionLabel: { fontSize: 7.5, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, marginBottom: 5 },
  blockName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  bodyLine: { fontSize: 9, lineHeight: 1.5 },

  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  metaKey: { fontSize: 9, color: C.muted },
  metaVal: { fontSize: 9, fontFamily: "Helvetica-Bold" },

  section: { marginTop: 22 },
  scopeBox: { backgroundColor: C.band, padding: 10, marginTop: 6 },
  scopeText: { fontSize: 9.5, lineHeight: 1.55 },

  nteBox: { marginTop: 18, borderWidth: 1, borderColor: C.line, padding: 10 },
  nteLabel: { fontSize: 7.5, color: C.muted, fontFamily: "Helvetica-Bold", letterSpacing: 0.8 },
  nteValue: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 3 },
  nteNote: { fontSize: 8, color: C.alert, marginTop: 4, lineHeight: 1.4 },

  instructionsText: { fontSize: 9, lineHeight: 1.6, marginTop: 6 },

  footer: { position: "absolute", bottom: 30, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  footerText: { fontSize: 7.5, color: C.muted },
});

function cityLine(p: {
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
}): string | null {
  const lines = formatAddressLines({
    addressLine1: null,
    addressLine2: null,
    city: p.city,
    stateProvince: p.stateProvince,
    postalCode: p.postalCode,
  });
  return lines[0] ?? null;
}

function CompanyBlock({ company }: { company: WorkOrderPdfCompany }) {
  const line2 = cityLine(company);
  return (
    <View style={{ width: "55%" }}>
      <Text style={styles.companyName}>{company.legalName ?? company.name}</Text>
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

function SiteBlock({ site }: { site: WorkOrderPdfSite }) {
  const line2 = cityLine(site);
  return (
    <View style={styles.col}>
      <Text style={styles.sectionLabel}>SERVICE LOCATION</Text>
      {site.clientName ? <Text style={styles.blockName}>{site.clientName}</Text> : null}
      {site.locationName ? <Text style={styles.bodyLine}>{site.locationName}</Text> : null}
      {site.addressLine1 ? <Text style={styles.bodyLine}>{site.addressLine1}</Text> : null}
      {site.addressLine2 ? <Text style={styles.bodyLine}>{site.addressLine2}</Text> : null}
      {line2 ? <Text style={styles.bodyLine}>{line2}</Text> : null}
    </View>
  );
}

export function WorkOrderDocument({ data }: { data: WorkOrderPdfData }) {
  const { company, vendor, site, coordinator } = data;

  return (
    <Document
      title={`Work Order ${data.workOrderLabel}`}
      author={company.legalName ?? company.name}
      subject={`Work order ${data.workOrderLabel} for ${vendor.vendorName}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <CompanyBlock company={company} />
          <View style={{ width: "40%" }}>
            <Text style={styles.docTitle}>WORK ORDER</Text>
            <Text style={styles.docLabel}>{data.workOrderLabel}</Text>
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.cols}>
          <View style={styles.col}>
            <Text style={styles.sectionLabel}>ISSUED TO</Text>
            <Text style={styles.blockName}>{vendor.vendorName}</Text>
            {vendor.contactName ? <Text style={styles.bodyLine}>{vendor.contactName}</Text> : null}
            {vendor.contactPhone ? (
              <Text style={styles.bodyLine}>{formatPhone(vendor.contactPhone)}</Text>
            ) : null}
            {vendor.contactEmail ? <Text style={styles.bodyLine}>{vendor.contactEmail}</Text> : null}
          </View>
          <SiteBlock site={site} />
        </View>

        <View style={[styles.cols, { marginTop: 18 }]}>
          <View style={styles.col}>
            {data.tradeName ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Trade</Text>
                <Text style={styles.metaVal}>{data.tradeName}</Text>
              </View>
            ) : null}
            {data.priorityName ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Priority</Text>
                <Text style={styles.metaVal}>{data.priorityName}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.col}>
            {data.scheduledStartAt ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Scheduled start</Text>
                <Text style={styles.metaVal}>{formatDateTime(data.scheduledStartAt, data.siteTimeZone)}</Text>
              </View>
            ) : null}
            {data.issuedAt ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Issued</Text>
                <Text style={styles.metaVal}>{formatDateTime(data.issuedAt, data.siteTimeZone)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SCOPE OF WORK</Text>
          <View style={styles.scopeBox}>
            <Text style={styles.scopeText}>
              {data.scope ?? "Scope to be confirmed by the coordinator before work begins."}
            </Text>
          </View>
        </View>

        {/* The vendor's own ceiling — the only money on this document. Omitted entirely when
            absent: a blank or zero NTE would read as "no limit", the same misreading batch 2's
            token rules exist to prevent. */}
        {data.agreedNteAmount ? (
          <View style={styles.nteBox}>
            <Text style={styles.nteLabel}>NOT TO EXCEED</Text>
            <Text style={styles.nteValue}>{formatMoney(data.agreedNteAmount)}</Text>
            <Text style={styles.nteNote}>
              Do not exceed this amount without written authorization from the coordinator. Work
              performed beyond this ceiling without prior approval may not be payable.
            </Text>
          </View>
        ) : null}

        {/* The resolved dispatch instructions (batch 1 storage + batch 2 substitution). Rendered
            verbatim as one pre-wrapped block: the operator's line breaks and paragraphing are
            meaningful, and re-flowing them here would change a document the client's own SOP text
            is quoted into. Omitted entirely when nothing is configured — never an empty heading. */}
        {data.instructions ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DISPATCH INSTRUCTIONS</Text>
            <Text style={styles.instructionsText}>{data.instructions}</Text>
          </View>
        ) : null}

        {coordinator.name || coordinator.email || coordinator.phone ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COORDINATOR</Text>
            {coordinator.name ? <Text style={styles.bodyLine}>{coordinator.name}</Text> : null}
            {coordinator.phone ? (
              <Text style={styles.bodyLine}>{formatPhone(coordinator.phone)}</Text>
            ) : null}
            {coordinator.email ? <Text style={styles.bodyLine}>{coordinator.email}</Text> : null}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {data.workOrderLabel} · {vendor.vendorName}
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
