import "server-only";

import { getClientInvoice, listClientInvoiceLineItems } from "@/server/billing/client-invoices";
import { getClient } from "@/server/clients";
import { getLocation, listLocations } from "@/server/client-locations";
import { getJob } from "@/server/jobs";
import { getTenantCompanyProfile } from "@/server/tenant-settings";

// ── invoice-pdf batch 2 — PDF DATA ASSEMBLY (the markup-free boundary) ────────────────
// Gathers everything the invoice PDF renders, from the EXISTING readers (getClientInvoice,
// listClientInvoiceLineItems, getJob, getLocation, getTenantCompanyProfile) — a pure read; no
// new query, no computation. All money is writer-owned by recalculateClientInvoiceTotals.
//
// ★★ THE HARD RULE (OQ-6) — markup_total / markup_percent / markup_amount are INTERNAL MARGIN and
// must NEVER reach a client-facing document. This module is where that is ENFORCED STRUCTURALLY,
// not by discipline: the DTOs below simply have NO markup fields, and the renderer accepts ONLY a
// DTO. The row types coming out of the readers DO carry markup columns; they stop here. A future
// edit cannot leak markup into the PDF without first adding a field to these types — which is the
// point. DO NOT widen these DTOs to the raw row types.

/** The aggregator's identity — the "from" block. All optional; falls back to tenants.name. */
export type InvoicePdfCompany = {
  name: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  remitTo: string | null;
  phone: string | null;
  email: string | null;
};

/** The "bill to" block — LOCATION-DERIVED (P4). A dedicated client billing address is deferred (D2). */
export type InvoicePdfBillTo = {
  clientName: string;
  locationName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
};

/** Client-facing line columns ONLY. No markupPercent, no markupAmount — deliberately absent. */
export type InvoicePdfLine = {
  lineNumber: number;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  extendedAmount: string;
  taxAmount: string;
};

/** Client-facing totals ONLY. No markupTotal — deliberately absent. */
export type InvoicePdfData = {
  /**
   * TRUE when the invoice carries undisclosed markup (markup_total > 0), which makes the
   * client-facing arithmetic fail to reconcile: lines and subtotal are PRE-markup while `total` is
   * POST-markup, so the difference reads as an unexplained gap. A BOOLEAN, never the amount — the
   * DTO's no-markup-value invariant is intact; this says only THAT there is markup, not how much.
   * The renderer refuses to produce such a document (see renderClientInvoicePdf). Resolved when B
   * (configurable line-item types) lands the disclosed "Contract markup" line.
   */
  hasUndisclosedMarkup: boolean;
  /** Always a printable string — see resolveInvoiceLabel for the pre-existing-null fallback. */
  invoiceLabel: string;
  /** True when invoiceLabel is a fallback rather than a real allocated number. */
  invoiceLabelIsFallback: boolean;
  status: string;
  jobNumber: number | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  paymentTermsDays: number | null;
  currency: string;
  company: InvoicePdfCompany;
  billTo: InvoicePdfBillTo;
  lines: InvoicePdfLine[];
  subtotal: string;
  taxTotal: string;
  total: string;
};

/**
 * The invoice's printable identity. Batch 1 made invoice_number always-set going forward, but rows
 * created BEFORE that migration can still be null (local pm has none; prod Neon may). Rather than
 * print an empty header, fall back to a clear, honest marker:
 *   - draft with no number  → "DRAFT"
 *   - issued with no number → "INV-<last 8 of id>" (traceable, obviously not a sequence number)
 * PURE — exported so the verify layer can assert it without a DB.
 */
export function resolveInvoiceLabel(input: {
  invoiceNumber: string | null;
  status: string;
  id: string;
}): { label: string; isFallback: boolean } {
  if (input.invoiceNumber && input.invoiceNumber.trim()) {
    return { label: input.invoiceNumber.trim(), isFallback: false };
  }
  if (input.status === "draft") return { label: "DRAFT", isFallback: true };
  return { label: `INV-${input.id.slice(-8).toUpperCase()}`, isFallback: true };
}

/**
 * Assemble everything the PDF needs. Tenant-scoped throughout. Returns null when the invoice does
 * not exist in this tenant (the caller turns that into a 404) — the tenant guard, not an exception.
 *
 * BILL-TO resolution (P4, location-derived): the JOB's client_location when resolvable, else the
 * client's first non-archived location, else name-only. A SERVICE location is not semantically a
 * billing address — that is D2 and deliberately deferred.
 */
export async function loadInvoicePdfData(
  tenantId: string,
  clientInvoiceId: string,
): Promise<InvoicePdfData | null> {
  const inv = await getClientInvoice(tenantId, clientInvoiceId);
  if (!inv) return null;

  const [rawLines, company, client, job] = await Promise.all([
    listClientInvoiceLineItems(tenantId, clientInvoiceId),
    getTenantCompanyProfile(tenantId),
    getClient(tenantId, inv.clientId),
    getJob(tenantId, inv.jobId),
  ]);

  // Bill-to: prefer the job's own location, else the client's first non-archived one.
  let location = job?.clientLocationId ? await getLocation(tenantId, job.clientLocationId) : null;
  if (!location) {
    const locations = await listLocations(tenantId, inv.clientId);
    location = locations[0] ?? null;
  }

  const { label, isFallback } = resolveInvoiceLabel({
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    id: inv.id,
  });

  return {
    // Boolean only — inv.markupTotal is COMPARED here and never carried out of this function.
    // Detecting on markup_total (rather than the billing model) is deliberate: the gap is caused by
    // markup being present, whatever produced it. A cost_plus invoice whose client has no markup rule
    // has markup_total 0 and renders fine; a rate_sheet invoice where an operator hand-typed a markup
    // percent WOULD gap, and is caught here too. The arithmetic is the truth, not the model label.
    hasUndisclosedMarkup: Number(inv.markupTotal) > 0,
    invoiceLabel: label,
    invoiceLabelIsFallback: isFallback,
    status: inv.status,
    jobNumber: job?.jobNumber ?? null,
    issuedAt: inv.issuedAt,
    dueAt: inv.dueAt,
    paymentTermsDays: inv.paymentTermsDays,
    currency: inv.currency,
    company: {
      // tenants.name is NOT NULL, so the letterhead always has something to print.
      name: company?.name ?? "",
      legalName: company?.legalName ?? null,
      addressLine1: company?.addressLine1 ?? null,
      addressLine2: company?.addressLine2 ?? null,
      city: company?.city ?? null,
      stateProvince: company?.stateProvince ?? null,
      postalCode: company?.postalCode ?? null,
      country: company?.country ?? null,
      remitTo: company?.remitTo ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
    },
    billTo: {
      clientName: client?.name ?? "(client)",
      locationName: location?.name ?? null,
      addressLine1: location?.addressLine1 ?? null,
      addressLine2: location?.addressLine2 ?? null,
      city: location?.city ?? null,
      stateProvince: location?.stateProvince ?? null,
      postalCode: location?.postalCode ?? null,
      country: location?.country ?? null,
    },
    // ★ Explicit field-by-field map — markupPercent / markupAmount are DROPPED here, at the boundary.
    lines: rawLines.map((l) => ({
      lineNumber: l.lineNumber,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      extendedAmount: l.extendedAmount,
      taxAmount: l.taxAmount,
    })),
    subtotal: inv.subtotal,
    taxTotal: inv.taxTotal,
    // ★ inv.markupTotal is NOT copied. `total` already includes it — that is the whole point of OQ-6:
    //   the client sees the marked-up total, never the cost+markup split.
    total: inv.total,
  };
}
