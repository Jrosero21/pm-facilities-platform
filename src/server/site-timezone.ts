import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { clientLocations, jobVendorAssignments, jobs } from "@/server/schema";
import { DEFAULT_DISPLAY_TIME_ZONE } from "@/lib/format-date";
import { isValidTimeZone } from "@/lib/datetime";

// ── TIMEZONE PART B — ONE resolver for "what zone does this job's site keep?" ──
//
// Every schedule-bearing surface needs the same answer, and they must all get it the same way: a
// page that renders in the site zone while its action parses in another silently shifts the stored
// instant by the offset between them. Centralising the lookup is what keeps the two ends honest.
//
// The fallback is DEFAULT_DISPLAY_TIME_ZONE, and it is the LIVE path today — client_locations.
// timezone is null for every row until the backfill runs. That is survivable only because
// formatDateTime always renders the zone LABEL: a fallback says "EDT" out loud rather than showing
// a bare time the reader would assume was local.

/** The zone used when a site has no timezone of its own. Re-exported so callers need one import. */
export { DEFAULT_DISPLAY_TIME_ZONE };

/** Guard a stored value before handing it to Intl — a bad row must not blank a whole page. */
function usable(timezone: string | null | undefined): string {
  return timezone && isValidTimeZone(timezone) ? timezone : DEFAULT_DISPLAY_TIME_ZONE;
}

/**
 * The IANA zone for the site a job is at, falling back to DEFAULT_DISPLAY_TIME_ZONE.
 *
 * Never throws and never returns null: every caller needs *a* zone to render or parse with, and a
 * labeled fallback is always better than a crash or an unlabeled time.
 */
export async function getJobSiteTimeZone(tenantId: string, jobId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: clientLocations.timezone })
    .from(jobs)
    .innerJoin(clientLocations, eq(jobs.clientLocationId, clientLocations.id))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId)))
    .limit(1);

  return usable(row?.timezone);
}

/**
 * The site zone for the job an assignment belongs to.
 *
 * A separate query rather than "load the assignment, then call the above" so the dispatch surfaces
 * pay one round trip instead of two.
 */
export async function getAssignmentSiteTimeZone(
  tenantId: string,
  assignmentId: string,
): Promise<string> {
  const [row] = await db
    .select({ timezone: clientLocations.timezone })
    .from(jobVendorAssignments)
    .innerJoin(jobs, eq(jobVendorAssignments.jobId, jobs.id))
    .innerJoin(clientLocations, eq(jobs.clientLocationId, clientLocations.id))
    .where(
      and(
        eq(jobVendorAssignments.tenantId, tenantId),
        eq(jobVendorAssignments.id, assignmentId),
      ),
    )
    .limit(1);

  return usable(row?.timezone);
}
