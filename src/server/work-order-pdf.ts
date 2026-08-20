import "server-only";

import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import {
  loadWorkOrderPdfData,
  workOrderPdfFilename,
} from "@/server/work-order-pdf-data";
import { WorkOrderDocument } from "@/server/work-order-pdf-document";

// ── vendor-WO batch 3 — RENDER ENTRY POINT ────────────────────────────────────────────
// assignmentId → PDF bytes. Mirrors renderClientInvoicePdf exactly: same discriminated result, same
// tenant scoping (loadWorkOrderPdfData returns not_found for another tenant's assignment, which the
// caller turns into a 404), same render-on-demand posture — nothing is persisted.
//
// createElement instead of JSX so this stays a .ts module; the JSX lives in the .tsx document.
//
// ★ THERE IS NO "blocked" CASE TODAY, and the variant is kept anyway. The invoice has one because
// a cost-plus invoice can be arithmetically wrong to show. A work order has no equivalent
// self-inconsistency: absent facts are omitted rather than mis-stated (batch 2's rules). Keeping
// the variant means a future guard — an unsent assignment, a withdrawn dispatch — is added without
// changing this function's contract or every caller's switch.

export type RenderedWorkOrderPdf = { bytes: Uint8Array; filename: string };

export type RenderWorkOrderPdfResult =
  | ({ kind: "ok" } & RenderedWorkOrderPdf)
  | { kind: "not_found" }
  | { kind: "blocked"; message: string };

/**
 * Render the work order for one vendor assignment.
 *
 * ★ @react-pdf renders ONLY in the Next runtime — the tsx harness dies in the reconciler
 * ("Cannot read properties of undefined (reading 'S')"). Verify through the route or a running
 * app, never a tsx script. This is the banked harness note and it applies here identically.
 */
export async function renderWorkOrderPdf(
  tenantId: string,
  assignmentId: string,
): Promise<RenderWorkOrderPdfResult> {
  const assembly = await loadWorkOrderPdfData(tenantId, assignmentId);
  if (assembly.kind === "not_found") return { kind: "not_found" };

  const { data } = assembly;
  // renderToBuffer types its argument as ReactElement<DocumentProps> — it wants the <Document>
  // itself, not a component returning one. WorkOrderDocument does return a <Document>, so this is
  // sound at runtime; the cast only bridges that signature. Same single unsafe line the invoice
  // renderer confines, and confined here for the same reason.
  const element = createElement(WorkOrderDocument, { data }) as unknown as ReactElement<DocumentProps>;
  const bytes = await renderToBuffer(element);
  return { kind: "ok", bytes, filename: workOrderPdfFilename(data.workOrderLabel) };
}
