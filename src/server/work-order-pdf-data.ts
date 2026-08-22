import "server-only";

import { getAssignmentDetail } from "@/server/dispatch";
import { getJobDetail } from "@/server/jobs";
import { getVendor } from "@/server/vendors";
import { getVendorContact } from "@/server/vendor-contacts";
import { getLocation } from "@/server/client-locations";
import { DEFAULT_DISPLAY_TIME_ZONE } from "@/lib/format-date";
import { isValidTimeZone } from "@/lib/datetime";
import { getTenantCompanyProfile } from "@/server/tenant-settings";
import { assembleDispatchContext } from "@/server/dispatch-context";
import { renderDispatchTemplate } from "@/server/dispatch-template";
import type { DispatchInstructionsSource } from "@/server/dispatch-instructions";

// ── vendor-WO batch 3 — WORK ORDER PDF DATA ASSEMBLY ──────────────────────────────────
// Mirrors invoice-pdf-data.ts: gather from the EXISTING readers, hand the renderer a DTO, and let
// the DTO shape enforce what may appear on the document rather than relying on discipline at the
// layout layer.
//
// ★★ THE HARD RULE HERE IS THE MIRROR IMAGE OF THE INVOICE'S.
// The invoice must never show INTERNAL MARGIN to a CLIENT. A work order must never show CLIENT
// PRICE to a VENDOR. The two documents leak in opposite directions, so this DTO deliberately
// carries NO client-side money at all — no client invoice figure, no rate sheet, no markup, no
// job.notToExceedAmount. The ONLY money is the assignment's agreedNteAmount: the ceiling this
// vendor was actually dispatched under, which is theirs to know and the one number they must not
// exceed. A future edit cannot leak client pricing without first adding a field here.
//
// ★ IT IS KEYED ON THE ASSIGNMENT, NOT THE JOB. A work order is issued TO a vendor, and only the
// assignment knows which vendor, which agreed NTE, and which scope snapshot they accepted. A job
// with three assignments has three different work orders, and rendering from the job alone would
// have to invent which one it meant.

/** The aggregator's identity — the "from" letterhead. Same source as the invoice PDF. */
export type WorkOrderPdfCompany = {
  name: string;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
};

/** Who the work order is issued TO. */
export type WorkOrderPdfVendor = {
  vendorName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** Where the work happens. */
export type WorkOrderPdfSite = {
  clientName: string | null;
  locationName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
};

/** Who the vendor calls. Phone is the TENANT's main line — users carries no phone column. */
export type WorkOrderPdfCoordinator = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type WorkOrderPdfData = {
  company: WorkOrderPdfCompany;
  vendor: WorkOrderPdfVendor;
  site: WorkOrderPdfSite;
  coordinator: WorkOrderPdfCoordinator;

  /** Human label for the document, e.g. "WO-1042". */
  workOrderLabel: string;
  jobNumber: number | null;
  tradeName: string | null;
  priorityName: string | null;
  scheduledStartAt: Date | null;
  issuedAt: Date | null;

  /**
   * ★ The SITE's IANA timezone — the zone every time on this document is rendered and labeled in.
   *
   * A work order is the most timezone-sensitive surface in the product: the vendor reading it is
   * often in a different zone from the coordinator who wrote it, and an unlabeled "4:00 PM" that
   * silently meant Eastern is a missed appointment and a wasted truck roll. Falls back to
   * DEFAULT_DISPLAY_TIME_ZONE when the location has none, and the render labels the fallback so the
   * assumption is visible rather than implied.
   */
  siteTimeZone: string;

  /**
   * The scope snapshot the vendor was dispatched against (assignment.dispatchScope), falling back
   * to the job's approved/entered scope. NEVER the raw problem description — dispatch-notify made
   * the same choice, and a work order is even more binding than the email.
   */
  scope: string | null;

  /**
   * The agreed ceiling for THIS assignment. The only money on the document.
   * Canonical "d.dd"; the renderer formats it.
   */
  agreedNteAmount: string | null;

  /** The resolved dispatch instructions — tokens already substituted (batch 2). */
  instructions: string | null;
  instructionsSource: DispatchInstructionsSource;
};

export type WorkOrderPdfAssembly =
  | { kind: "ok"; data: WorkOrderPdfData }
  | { kind: "not_found" };

/** WO-1042 style. Falls back to the assignment id when a job somehow has no number. */
export function workOrderLabel(jobNumber: number | null, assignmentId: string): string {
  return jobNumber === null ? `WO-${assignmentId.slice(0, 8)}` : `WO-${jobNumber}`;
}

/** A filesystem-safe filename: work-order-WO-1042.pdf. Mirrors invoicePdfFilename. */
export function workOrderPdfFilename(label: string): string {
  const safe = label.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `work-order-${safe || "unnumbered"}.pdf`;
}

/**
 * Assemble the work order for one assignment, tenant-scoped.
 * Returns not_found for an unknown/cross-tenant assignment or a missing job.
 */
export async function loadWorkOrderPdfData(
  tenantId: string,
  assignmentId: string,
): Promise<WorkOrderPdfAssembly> {
  const assignment = await getAssignmentDetail(tenantId, assignmentId);
  if (!assignment) return { kind: "not_found" };

  const job = await getJobDetail(tenantId, assignment.jobId);
  if (!job) return { kind: "not_found" };

  const [company, vendor, contact, location, dispatchCtx] = await Promise.all([
    getTenantCompanyProfile(tenantId),
    getVendor(tenantId, assignment.vendorId),
    assignment.vendorContactId
      ? getVendorContact(tenantId, assignment.vendorContactId)
      : Promise.resolve(null),
    job.clientLocationId ? getLocation(tenantId, job.clientLocationId) : Promise.resolve(null),
    // Batch 2 — the token context AND the client/tenant template resolution in one call.
    assembleDispatchContext(tenantId, assignment.jobId, assignment.id),
  ]);

  // Substitute the tokens. A job with no configured template yields an empty string, which the
  // renderer turns into an omitted section rather than an empty heading.
  const rendered = dispatchCtx
    ? renderDispatchTemplate(dispatchCtx.rawTemplate, dispatchCtx.context)
    : null;
  const instructions = rendered && rendered.text.trim() !== "" ? rendered.text : null;

  return {
    kind: "ok",
    data: {
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
        phone: company?.phone ?? null,
        email: company?.email ?? null,
      },
      vendor: {
        vendorName: vendor?.name ?? assignment.vendorName ?? "",
        contactName: contact?.name ?? assignment.vendorContactName ?? null,
        contactEmail: contact?.email ?? null,
        contactPhone: contact?.phone ?? null,
      },
      site: {
        clientName: job.clientName ?? null,
        locationName: job.locationName ?? null,
        addressLine1: location?.addressLine1 ?? null,
        addressLine2: location?.addressLine2 ?? null,
        city: location?.city ?? null,
        stateProvince: location?.stateProvince ?? null,
        postalCode: location?.postalCode ?? null,
        country: location?.country ?? null,
      },
      coordinator: {
        name: dispatchCtx?.context.coordinatorName ?? null,
        email: dispatchCtx?.context.coordinatorEmail ?? null,
        phone: dispatchCtx?.context.coordinatorPhone ?? null,
      },
      workOrderLabel: workOrderLabel(assignment.jobNumber ?? null, assignment.id),
      jobNumber: assignment.jobNumber ?? null,
      tradeName: assignment.matchedTradeName ?? job.tradeName ?? null,
      priorityName: job.priorityName ?? null,
      scheduledStartAt: assignment.scheduledStartAt ?? null,
      issuedAt: assignment.sentAt ?? null,
      // getLocation is an unprojected .select(), so the timezone column is already in memory here —
      // no extra query, it was simply never read.
      siteTimeZone:
        location?.timezone && isValidTimeZone(location.timezone)
          ? location.timezone
          : DEFAULT_DISPLAY_TIME_ZONE,
      scope: assignment.dispatchScope ?? job.approvedScopeOfWork ?? job.scopeOfWork ?? null,
      agreedNteAmount: assignment.agreedNteAmount ?? null,
      instructions,
      instructionsSource: dispatchCtx?.instructionsSource ?? "none",
    },
  };
}
