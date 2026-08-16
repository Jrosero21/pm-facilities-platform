// ── invoice-pdf batch 2 — ON-DEMAND INVOICE PDF DOWNLOAD ──────────────────────────────
// GET /api/client-invoices/<id>/pdf → renders the invoice and streams it as an attachment.
// Nothing is persisted: render-on-demand only (R2-backed archive/re-download is deferred, D3).
//
// AUTHORIZATION — two independent checks, both required:
//   1. requireTenant() — resolves the caller's active tenant (and redirects an unauthenticated
//      caller), and the render is scoped to THAT tenant id, never one from the URL. An id belonging
//      to another tenant simply does not resolve → 404. There is no tenant parameter to tamper with.
//   2. canSeeFinancials — accounting OR tenant_admin, the SAME predicate that gates the job page's
//      client-invoices section (jobs/[id]/page.tsx:534) and the bill action. Without it this route
//      would be a hole AROUND the UI gate: a tenant member with no financial role could fetch the
//      URL directly and read invoice money the UI never shows them.
// 404 (not 403) on a missing/other-tenant invoice — an existence oracle would leak which ids exist.

import { requireTenant } from "@/server/auth-context";
import { canSeeFinancials } from "@/server/role-predicates";
import { renderClientInvoicePdf } from "@/server/billing/invoice-pdf";

export const dynamic = "force-dynamic"; // per-request, per-tenant — never cached

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientInvoiceId: string }> },
) {
  const { clientInvoiceId } = await params;
  const ctx = await requireTenant();
  if (!canSeeFinancials(ctx)) {
    return new Response("Forbidden", { status: 403 });
  }

  const rendered = await renderClientInvoicePdf(ctx.activeTenant.tenantId, clientInvoiceId);
  if (!rendered) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(rendered.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${rendered.filename}"`,
      "Content-Length": String(rendered.bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
