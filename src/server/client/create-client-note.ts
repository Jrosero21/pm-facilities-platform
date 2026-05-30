import "server-only";

import { getClientJobDetail } from "@/server/client/get-client-job-detail";
import { createJobNote } from "@/server/job-notes";

/**
 * Client creates an update (note) on one of their own jobs — Phase 11 batch 11g.
 *
 * Mirrors createVendorNote's guard+delegate shape: scope-guard via
 * getClientJobDetail (the single source of client isolation truth — tenant +
 * clientScope.has(clientId)); throw CLIENT_SCOPE_MISMATCH if the job is not in
 * the viewer's scope so a client cannot post to another client's job. Delegates
 * to createJobNote with visibility='client_visible' (visible to client +
 * operators, NOT auto-pushed to vendors — 11g Fork a) and origin='client'
 * (activates the dormant origin='client' branch wired in 11e's listClientJobNotes;
 * the varchar(16) column accepts it with no migration).
 *
 * createJobNote's own getJob guard is the second gate; a throw before its insert
 * = zero rows written.
 */
export async function createClientNote(input: {
  tenantId: string;
  jobId: string;
  clientScope: Set<string>;
  actorUserId: string;
  body: string;
}) {
  const detail = await getClientJobDetail(
    input.tenantId,
    input.jobId,
    input.clientScope,
  );
  if (!detail) throw new Error("CLIENT_SCOPE_MISMATCH");

  return createJobNote({
    tenantId: input.tenantId,
    jobId: input.jobId,
    body: input.body,
    createdByUserId: input.actorUserId,
    visibility: "client_visible",
    origin: "client",
  });
}
