import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import { loadInvoicePdfData } from "@/server/billing/invoice-pdf-data";
import { InvoiceDocument } from "@/server/billing/invoice-pdf-document";

// ── invoice-pdf batch 2 — RENDER ENTRY POINT ──────────────────────────────────────────
// clientInvoiceId → PDF bytes. Tenant-scoped (loadInvoicePdfData returns null for another
// tenant's invoice, which the caller turns into a 404). Renders ON DEMAND and streams — nothing is
// persisted; R2-backed archive/re-download is deferred (D3).
//
// createElement instead of JSX so this stays a .ts module: the JSX lives in the .tsx document.

export type RenderedInvoicePdf = { bytes: Uint8Array; filename: string };

/** A filesystem-safe filename: invoice-INV-000005.pdf (label sanitized — it can be operator text). */
export function invoicePdfFilename(invoiceLabel: string): string {
  const safe = invoiceLabel.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `invoice-${safe || "unnumbered"}.pdf`;
}

/** Render the invoice. Returns null when it does not exist in this tenant. */
export async function renderClientInvoicePdf(
  tenantId: string,
  clientInvoiceId: string,
): Promise<RenderedInvoicePdf | null> {
  const data = await loadInvoicePdfData(tenantId, clientInvoiceId);
  if (!data) return null;

  // renderToBuffer types its argument as ReactElement<DocumentProps> — i.e. it wants <Document>
  // ITSELF, not a component that RETURNS one. InvoiceDocument does return a <Document>, so this is
  // sound at runtime; the cast is only bridging that signature. It is the single unsafe line in the
  // PDF path, and it is confined here rather than loosening InvoiceDocument's own props.
  const element = createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>;
  const bytes = await renderToBuffer(element);
  return { bytes, filename: invoicePdfFilename(data.invoiceLabel) };
}
