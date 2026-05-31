import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { externalSystems } from "@/server/schema";
import { getSystemUserId } from "@/server/integrations/system-user";
import { ingestWorkOrder, type IngestResult } from "@/lib/integrations/core/ingest";
import type { NormalizedWorkOrder } from "@/lib/integrations/core/types";

// ── Phase 12 batch 12h-B — INGEST SERVER WRAPPER (the SOLE authz/scope gate) ──────────
// The generic engine (core/ingest.ts) trusts its caller for scope, exactly as createJob/
// createLocation trust theirs. This wrapper is where the trust is established:
//   - tenantId is derived from the external_systems row (NOT from the payload) — the
//     system's tenant is the scope pin; an external WO can only ever land in that tenant.
//   - createdByUserId is the system/integration user (SF-1), resolved by email — never a
//     payload-supplied or fabricated id.
// An unknown or inactive system is rejected before any write.

export async function ingestExternalJob(opts: {
  externalSystemId: string;
  wo: NormalizedWorkOrder;
}): Promise<IngestResult> {
  const system = (
    await db
      .select({ id: externalSystems.id, tenantId: externalSystems.tenantId, status: externalSystems.status })
      .from(externalSystems)
      .where(eq(externalSystems.id, opts.externalSystemId))
      .limit(1)
  )[0];

  if (!system) throw new Error("EXTERNAL_SYSTEM_NOT_FOUND");
  if (system.status !== "active") throw new Error("EXTERNAL_SYSTEM_INACTIVE");

  const createdByUserId = await getSystemUserId(); // SF-1; throws SYSTEM_USER_NOT_SEEDED if absent

  return ingestWorkOrder(
    {
      tenantId: system.tenantId, // scope pin — from the system row, never the payload
      externalSystemId: system.id,
      createdByUserId,
    },
    opts.wo,
  );
}
