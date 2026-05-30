import "server-only";

import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/server/db";
import { jobNotes, users, clientUsers } from "@/server/schema";
import { getClientJobDetail } from "@/server/client/get-client-job-detail";

/**
 * Lists notes visible to a client on a given job (net-new; client-visibility set).
 *
 * Fork-5 filter (the listVendorAssignmentNotes twin), a note is visible iff:
 *   visibility IN ('client_visible', 'client_and_vendor_visible')
 *   OR (origin = 'client' AND created_by_user_id IN
 *       (SELECT user_id FROM client_users WHERE tenant_id = T AND client_id IN S))
 *
 * The origin='client' branch is forward-correct — it returns nothing until 11g
 * (createClientNote) lands; it mirrors how the vendor reader carries its
 * origin='vendor' branch. The client_users author-scope subquery keeps a client's
 * own notes scoped to their org.
 *
 * Defense-in-depth: re-verify the job belongs to an in-scope client via
 * getClientJobDetail before returning any notes (returns [] otherwise) — direct
 * note access by jobId can't leak another client's job notes.
 *
 * Phase 11 batch 11e.
 */
export async function listClientJobNotes(
  tenantId: string,
  jobId: string,
  clientScope: Set<string>,
) {
  if (clientScope.size === 0) return [];

  const detail = await getClientJobDetail(tenantId, jobId, clientScope);
  if (!detail) return [];

  // user_ids belonging to any client org in the viewer's scope.
  const clientUserSubquery = db
    .select({ userId: clientUsers.userId })
    .from(clientUsers)
    .where(
      and(
        eq(clientUsers.tenantId, tenantId),
        inArray(clientUsers.clientId, [...clientScope]),
      ),
    );

  return db
    .select({
      id: jobNotes.id,
      body: jobNotes.body,
      createdAt: jobNotes.createdAt,
      authorName: users.name,
    })
    .from(jobNotes)
    .leftJoin(users, eq(users.id, jobNotes.createdByUserId))
    .where(
      and(
        eq(jobNotes.tenantId, tenantId),
        eq(jobNotes.jobId, jobId),
        ne(jobNotes.status, "archived"),
        or(
          inArray(jobNotes.visibility, [
            "client_visible",
            "client_and_vendor_visible",
          ]),
          and(
            eq(jobNotes.origin, "client"),
            inArray(jobNotes.createdByUserId, clientUserSubquery),
          ),
        ),
      ),
    )
    .orderBy(desc(jobNotes.createdAt));
}
