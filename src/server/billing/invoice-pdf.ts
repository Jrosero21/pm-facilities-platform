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

/** Discriminated outcome: rendered · absent in this tenant · deliberately refused. */
export type RenderInvoicePdfResult =
  | ({ kind: "ok" } & RenderedInvoicePdf)
  | { kind: "not_found" }
  | { kind: "blocked"; message: string };

/** Shown to the operator when the render is refused. Plain English — it reaches a human. */
export const COST_PLUS_PDF_BLOCKED_MESSAGE =
  "Cost-plus invoice PDF is pending configurable line-item support. This invoice carries a contract " +
  "markup that has no line of its own yet, so the PDF's line items and subtotal would not add up to " +
  "the total. Issue it from the invoice screen, or download once markup lines are supported.";

/** A filesystem-safe filename: invoice-INV-000005.pdf (label sanitized — it can be operator text). */
export function invoicePdfFilename(invoiceLabel: string): string {
  const safe = invoiceLabel.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `invoice-${safe || "unnumbered"}.pdf`;
}

/**
 * Render the invoice.
 *
 * ★ INTERIM COST-PLUS GUARD (until B — configurable line-item types). When an invoice carries
 * markup, subtotal and the line amounts are PRE-markup while `total` is POST-markup, so the document
 * silently fails to add up — and an unexplained gap on a client-facing invoice is WORSE than no
 * document: it does not leak the margin figure, it advertises that one is being hidden. We therefore
 * REFUSE to render rather than ship a wrong invoice.
 *
 * Why refuse instead of cosmetically hiding the subtotal row: suppressing the subtotal does not
 * remove the discrepancy, it RELOCATES it — the line AMOUNTS still sum to the pre-markup figure
 * against a post-markup total, so anyone adding the column finds the same gap, now with no label on
 * it. That is a document that LOOKS correct and is not, which is the worse failure.
 *
 * rate_sheet and flat — the common and demo path — are unaffected: agreed-rate lines force
 * markup_percent null, so markup_total is 0, the arithmetic reconciles exactly, and they render in
 * full. OQ-6 is untouched either way: no markup value is printed, or even carried, in ANY branch.
 */
export async function renderClientInvoicePdf(
  tenantId: string,
  clientInvoiceId: string,
): Promise<RenderInvoicePdfResult> {
  const data = await loadInvoicePdfData(tenantId, clientInvoiceId);
  if (!data) return { kind: "not_found" };
  if (data.hasUndisclosedMarkup) {
    return { kind: "blocked", message: COST_PLUS_PDF_BLOCKED_MESSAGE };
  }

  // renderToBuffer types its argument as ReactElement<DocumentProps> — i.e. it wants <Document>
  // ITSELF, not a component that RETURNS one. InvoiceDocument does return a <Document>, so this is
  // sound at runtime; the cast is only bridging that signature. It is the single unsafe line in the
  // PDF path, and it is confined here rather than loosening InvoiceDocument's own props.
  const element = createElement(InvoiceDocument, { data }) as unknown as ReactElement<DocumentProps>;
  const bytes = await renderToBuffer(element);
  return { kind: "ok", bytes, filename: invoicePdfFilename(data.invoiceLabel) };
}
