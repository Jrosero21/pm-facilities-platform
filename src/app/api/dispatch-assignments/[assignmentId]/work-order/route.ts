// ── vendor-WO batch 3 — ON-DEMAND WORK ORDER PDF DOWNLOAD ─────────────────────────────
// GET /api/dispatch-assignments/<assignmentId>/work-order → renders and streams the work order as
// an attachment. Nothing is persisted: render-on-demand only, mirroring the invoice PDF route.
//
// AUTHORIZATION — two independent checks, both required:
//   1. requireTenant() — resolves the caller's active tenant, and the render is scoped to THAT
//      tenant id, never one from the URL. An assignment belonging to another tenant does not
//      resolve → 404. There is no tenant parameter to tamper with.
//   2. canSeeOperations — the dispatch/operations predicate, NOT canSeeFinancials.
//      ★ THE GATE DIFFERS FROM THE INVOICE ROUTE ON PURPOSE. The invoice PDF is gated on
//      financials because it carries client pricing. A work order carries no client money at all
//      (work-order-pdf-data.ts enforces that structurally) — its only figure is the vendor's own
//      agreed NTE, which every dispatcher already sees on the assignment screen. Gating this on
//      accounting would lock dispatchers out of the document they are the ones who send.
// 404 (not 403) on a missing/other-tenant assignment — an existence oracle would leak which ids exist.

import { requireTenant } from "@/server/auth-context";
import { canSeeOperations } from "@/server/role-predicates";
import { renderWorkOrderPdf } from "@/server/work-order-pdf";

export const dynamic = "force-dynamic"; // per-request, per-tenant — never cached

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const { assignmentId } = await params;
  const ctx = await requireTenant();
  if (!canSeeOperations(ctx)) {
    return new Response("Forbidden", { status: 403 });
  }

  const result = await renderWorkOrderPdf(ctx.activeTenant.tenantId, assignmentId);
  if (result.kind === "not_found") return new Response("Not found", { status: 404 });
  if (result.kind === "blocked") {
    return new Response(result.message, {
      status: 409,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(result.bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
