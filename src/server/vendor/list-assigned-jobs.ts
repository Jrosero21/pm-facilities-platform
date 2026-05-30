import "server-only";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/server/db";
import {
  jobVendorAssignments,
  jobs,
  clients,
  clientLocations,
  jobStatuses,
  dispatchAssignmentStatuses,
  trades,
  vendors,
} from "@/server/schema";

/**
 * Lists assignments visible to a vendor user in the active tenant.
 *
 * Assignment-primary query (mirrors listAssignmentsForJob from dispatch.ts)
 * filtered by vendorId IN scope. Joins jobs + clients + locations + job
 * statuses + dispatch-status reference + trades to produce a row shape the
 * vendor portal can render directly.
 *
 * DoR-10j.1: DRAFT assignments excluded. Drafts are operator workspace;
 * the vendor sees an assignment only after it has been sent.
 *
 * Tenant filter retained alongside scope filter for defense-in-depth
 * (mirrors canActOnAssignment's explicit tenantId check).
 *
 * Empty scope short-circuits to [] — drizzle's inArray() with an empty
 * list is dialect-specific; bypass the query entirely.
 *
 * Column names mirror the existing readers (listJobs / listAssignmentsForJob):
 * clients/clientLocations/jobStatuses/vendors/trades all expose `name`.
 *
 * Phase 10 batch 10j.
 */
export async function listVendorAssignments(
  tenantId: string,
  vendorScope: Set<string>,
) {
  if (vendorScope.size === 0) {
    return [];
  }
  return db
    .select({
      assignmentId: jobVendorAssignments.id,
      jobId: jobs.id,
      jobNumber: jobs.jobNumber,
      clientName: clients.name,
      locationName: clientLocations.name,
      jobStatusName: jobStatuses.name,
      dispatchStatusCode: dispatchAssignmentStatuses.code,
      dispatchStatusName: dispatchAssignmentStatuses.name,
      dispatchStatusCategory: dispatchAssignmentStatuses.category,
      vendorId: vendors.id,
      vendorName: vendors.name,
      matchedTradeName: trades.name,
      agreedNteAmount: jobVendorAssignments.agreedNteAmount,
      scheduledStartAt: jobVendorAssignments.scheduledStartAt,
      sentAt: jobVendorAssignments.sentAt,
      createdAt: jobVendorAssignments.createdAt,
    })
    .from(jobVendorAssignments)
    .innerJoin(jobs, eq(jobs.id, jobVendorAssignments.jobId))
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .innerJoin(clientLocations, eq(clientLocations.id, jobs.clientLocationId))
    .innerJoin(jobStatuses, eq(jobStatuses.id, jobs.currentStatusId))
    .innerJoin(
      dispatchAssignmentStatuses,
      eq(dispatchAssignmentStatuses.id, jobVendorAssignments.currentStatusId),
    )
    .innerJoin(vendors, eq(vendors.id, jobVendorAssignments.vendorId))
    .innerJoin(trades, eq(trades.id, jobVendorAssignments.matchedTradeId))
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        inArray(jobVendorAssignments.vendorId, [...vendorScope]),
        ne(dispatchAssignmentStatuses.code, "DRAFT"),
      ),
    )
    .orderBy(desc(jobVendorAssignments.createdAt));
}

export type VendorAssignmentListItem = Awaited<
  ReturnType<typeof listVendorAssignments>
>[number];
