import "server-only";

import { getLocation } from "@/server/client-locations";
import { createJob } from "@/server/jobs";

/**
 * Client-portal job submission — the scope-pinning + validation unit (Phase 11's
 * central security work, 11f). Wraps createJob (Phase 4, unchanged): the wrapper
 * is the FIRST gate, createJob's own LOCATION_CLIENT_MISMATCH is the second.
 *
 * Non-negotiable invariants (11f):
 *   I1 client_id is pinned from clientScope authority — the caller's chosen
 *      clientId is re-validated ∈ clientScope (even at size 1), never a grant.
 *   I2 source_type pinned 'internal_client_portal' — never from form.
 *   I3 clientLocationId re-validated as belonging to the pinned client_id here
 *      (getLocation → location.clientId === clientId, and that client ∈ scope),
 *      AND again inside createJob (LOCATION_CLIENT_MISMATCH). Two gates.
 *   I4 any scope/location mismatch throws BEFORE createJob's txn → zero rows.
 *   I5 createdByUserId is the authenticated user (passed by the action from ctx).
 *
 * Throws CLIENT_SCOPE_MISMATCH (twin of vendor's VENDOR_SCOPE_MISMATCH) when the
 * clientId is outside scope or the location doesn't belong to the pinned client;
 * re-raises createJob's domain errors (LOCATION_NOT_FOUND, LOCATION_CLIENT_MISMATCH,
 * CLIENT_NOT_FOUND, PRIORITY_NOT_FOUND, STATUS_NOT_FOUND) unchanged.
 */
export type CreateClientJobInput = {
  tenantId: string;
  clientId: string;
  clientScope: Set<string>;
  clientLocationId: string;
  priorityId?: string | null;
  problemDescription: string;
  createdByUserId: string;
};

export async function createClientJob(input: CreateClientJobInput) {
  // I1/I4 — scope-pin gate: the chosen clientId must be in scope (even size 1).
  if (!input.clientScope.has(input.clientId)) {
    throw new Error("CLIENT_SCOPE_MISMATCH");
  }

  // I3 — wrapper-side location↔client gate (belt-and-suspenders ahead of createJob).
  // getLocation is tenant-scoped only; we additionally assert the location belongs
  // to the pinned, in-scope client so a location under another (even in-scope)
  // client can't be smuggled in.
  const location = await getLocation(input.tenantId, input.clientLocationId);
  if (!location) throw new Error("LOCATION_NOT_FOUND");
  if (
    location.clientId !== input.clientId ||
    !input.clientScope.has(location.clientId)
  ) {
    throw new Error("CLIENT_SCOPE_MISMATCH");
  }

  return createJob({
    tenantId: input.tenantId,
    clientId: input.clientId, // I1 pinned + validated
    clientLocationId: input.clientLocationId, // I3 validated (createJob re-checks)
    priorityId: input.priorityId ?? null, // form omits (F5a) → null
    primaryTradeId: null, // operator classifies later
    sourceType: "internal_client_portal", // I2 pinned
    problemDescription: input.problemDescription,
    createdByUserId: input.createdByUserId, // I5
    // notToExceedAmount omitted → createJob Case E → NULL (operator sets later)
  });
}
