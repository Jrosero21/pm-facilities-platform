/**
 * B-16.4 dev-seed — P2: the per-vendor generate loop.
 *
 * SANDBOX-ONLY. The env-swap guard at module top forces DATABASE_URL to the
 * *_sandbox DB and refuses otherwise (exit 2), BEFORE any @/server/db import.
 * Every row is namespaced under a dedicated seed tenant + SEED- vendor codes
 * so teardown (P4) removes only this seed's data, never the phase9 fixture.
 *
 * This file builds the world structure (tenant/client/location → vendors →
 * trade coverage → jobs+assignments+status-history). Presence timing detail
 * (ETA/check-in/out) and the manifest/teardown are P3/P4; this file exposes
 * the in-memory plan + the created-id record they consume.
 */

// ===== SANDBOX GUARD — module top, before any db import (verbatim convention) =====
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) {
  console.error("[b16.4-seed] DATABASE_URL not set — refusing to run.");
  process.exit(2);
}
const sandboxUrl = originalUrl.replace(/\/jonnyrosero_pm(\?|$)/, "/jonnyrosero_pm_sandbox$1");
if (!sandboxUrl.includes("jonnyrosero_pm_sandbox")) {
  console.error("[b16.4-seed] refusing to run: resolved URL is not a *_sandbox DB.");
  process.exit(2);
}
process.env.DATABASE_URL = sandboxUrl;
console.log("[b16.4-seed] target confirmed:", sandboxUrl.replace(/\/\/[^@]+@/, "//<creds>@"));

// ===== imports (AFTER the swap) =====
import {
  makeRng, rngInt, rngPick, rngBool,
  SEED, NS, WORLD, ARCHETYPES, ARCHETYPE_MIX, type ArchetypeKey,
} from "./config";

// DB-CONNECTING imports (@/server/db + the server fns createJob/createClient/
// createLocation, which transitively import db) are loaded DYNAMICALLY inside the
// functions below — AFTER the entrypoint's sandbox guard mutates env. A static
// import would hoist above the guard and connect to dev. @/server/schema is
// connection-safe (no schema file imports db) and stays static.
import { v7 as uuidv7 } from "uuid";
import { eq } from "drizzle-orm";
import {
  tenants, users, vendors, vendorTradeCoverage, trades,
  dispatchAssignmentStatuses, jobVendorAssignments,
} from "@/server/schema";

// ===== types for the in-memory plan (P3/P4 consume these) =====
export type PlannedAssignment = {
  assignmentId: string;
  jobId: string;
  vendorId: string;
  tradeId: string;
  scheduledStartAt: Date;
  // lifecycle outcome decided by archetype (drives history + presence in P3):
  outcome: "completed" | "declined" | "cancelled";
  onTime: boolean | null;        // null unless completed
};

export type PlannedVendor = {
  vendorId: string;
  vendorCode: string;
  archetype: ArchetypeKey;
  tradeIds: string[];
  assignments: PlannedAssignment[];
};

export type SeedPlan = {
  tenantId: string;
  clientId: string;
  locationId: string;
  seedUserId: string;
  vendors: PlannedVendor[];
  createdAt: string;
};

// ===== helpers =====
async function ensureSeedTenant(): Promise<string> {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  // dedicated namespaced tenant — never reuse phase9/Apple
  const existing = await db.select({ id: tenants.id })
    .from(tenants).where(eq(tenants.slug, NS.tenantSlug)).limit(1);
  if (existing[0]) return existing[0].id;
  const id = uuidv7();
  await db.insert(tenants).values({ id, name: NS.tenantName, slug: NS.tenantSlug });
  return id;
}

async function resolveSeedUser(): Promise<string> {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  // createdByUserId FK-references users.id, so it must be a real user. The creator
  // need NOT be a member of the seed tenant (createJob only guards client/location
  // in-tenant), so reuse an existing sandbox user — the phase9 admin, else any user.
  const admin = await db.select({ id: users.id })
    .from(users).where(eq(users.email, "admin@phase9seed.test")).limit(1);
  if (admin[0]) return admin[0].id;
  const any = await db.select({ id: users.id }).from(users).limit(1);
  if (!any[0]) throw new Error("[b16.4-seed] no users in sandbox — base-seed the DB first.");
  return any[0].id;
}

async function loadTradeIds(): Promise<string[]> {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  const rows = await db.select({ id: trades.id }).from(trades);
  return rows.map((r) => r.id);
}

export async function loadStatusIds(): Promise<Record<string, string>> {
  const { db } = await import("@/server/db"); // dynamic — after the guard
  // dispatch_assignment_statuses keyed by CODE (stable; survives display-name renames):
  // DRAFT/SENT/ACCEPTED/SCHEDULED/CONFIRMED/ON_SITE/WORK_COMPLETE/DECLINED/CANCELLED
  const rows = await db.select({
    id: dispatchAssignmentStatuses.id,
    code: dispatchAssignmentStatuses.code,
  }).from(dispatchAssignmentStatuses);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.code] = r.id;
  return map;
}

// ===== the build =====
export async function generatePlan(): Promise<SeedPlan> {
  // dynamic db-connecting imports — after the guard (the helpers load db themselves)
  const { db } = await import("@/server/db");
  const { createJob } = await import("@/server/jobs");
  const { createClient } = await import("@/server/clients");
  const { createLocation } = await import("@/server/client-locations");

  const rng = makeRng(SEED);
  const tenantId = await ensureSeedTenant();
  const seedUserId = await resolveSeedUser();

  // one namespaced client + location for all seed jobs
  const client = await createClient({
    tenantId, name: NS.clientName, createdByUserId: seedUserId,
  });
  const location = await createLocation({
    tenantId, clientId: client.id, name: "B16.4 Seed Site",
    addressLine1: "1 Seed Way", city: "Phoenix", stateProvince: "AZ",
    postalCode: "85001", country: "US", createdByUserId: seedUserId,
  });

  const allTradeIds = await loadTradeIds();
  const statusIds = await loadStatusIds();

  // expand the archetype mix into a vendor list
  const vendorArchetypes: ArchetypeKey[] = [];
  for (const m of ARCHETYPE_MIX) for (let i = 0; i < m.count; i++) vendorArchetypes.push(m.key);

  const plannedVendors: PlannedVendor[] = [];
  let vendorN = 0;

  for (const akey of vendorArchetypes) {
    vendorN++;
    const arch = ARCHETYPES[akey];
    const vendorCode = `${NS.vendorCodePrefix}${String(vendorN).padStart(3, "0")}`;

    const vendorId = uuidv7();
    await db.insert(vendors).values({
      id: vendorId, tenantId, name: `${arch.label} Vendor ${vendorN}`,
      vendorCode, vendorType: rngPick(rng, ["local", "regional", "national"] as const),
      status: "active",
    });

    // 1–3 trades, one primary
    const nTrades = rngInt(rng, WORLD.tradesPerVendor.min, WORLD.tradesPerVendor.max);
    const tradeIds: string[] = [];
    for (let i = 0; i < nTrades; i++) {
      const tId = rngPick(rng, allTradeIds);
      if (tradeIds.includes(tId)) continue;
      tradeIds.push(tId);
      await db.insert(vendorTradeCoverage).values({
        tenantId, vendorId, tradeId: tId, isPrimary: i === 0, status: "active",
      });
    }
    if (tradeIds.length === 0) tradeIds.push(rngPick(rng, allTradeIds));

    // assignment count — archetype-scaled, CLAMPED MIN 1 (P1 flag fix)
    const rawCount = rngInt(rng, WORLD.assignmentsPerVendor.min, WORLD.assignmentsPerVendor.max);
    const nAssign = Math.max(1, Math.round(rawCount * arch.assignmentScale));

    const assignments: PlannedAssignment[] = [];
    for (let i = 0; i < nAssign; i++) {
      const tradeId = rngPick(rng, tradeIds);

      // a job per assignment (createJob — validated path)
      const job = await createJob({
        tenantId, clientId: client.id, clientLocationId: location.id,
        primaryTradeId: tradeId,
        problemDescription: `Seed job ${vendorCode}#${i + 1} (${arch.label})`,
        createdByUserId: seedUserId,
      });

      // decide lifecycle outcome from archetype
      let outcome: PlannedAssignment["outcome"];
      let onTime: boolean | null = null;
      if (!rngBool(rng, arch.acceptRate)) {
        outcome = "declined";
      } else if (!rngBool(rng, arch.completeRate)) {
        outcome = "cancelled";
      } else {
        outcome = "completed";
        onTime = rngBool(rng, arch.onTimeRate);
      }

      // a scheduled start somewhere in the past 120 days
      const daysAgo = rngInt(rng, 1, 120);
      const scheduledStartAt = new Date(Date.now() - daysAgo * 86400_000
        - rngInt(rng, 0, 8) * 3600_000);

      // insert assignment with the PROVEN NOT-NULL pattern (check-phase-20),
      // explicit uuidv7 id (no $returningId — unused anywhere in the repo).
      const assignmentId = uuidv7();
      await db.insert(jobVendorAssignments).values({
        id: assignmentId, tenantId, jobId: job.id, vendorId,
        currentStatusId:
          outcome === "completed" ? statusIds["WORK_COMPLETE"]
          : outcome === "declined" ? statusIds["DECLINED"]
          : outcome === "cancelled" ? statusIds["CANCELLED"]
          : statusIds["SENT"],
        matchedTradeId: tradeId,
        matchedTradeWasPrimary: false,
        tightestGeoAtDispatch: "national",
        matchedGeoTypesAtDispatch: ["national"],
        complianceStatusAtDispatch: "ok",
        scheduledStartAt,
      });

      assignments.push({
        assignmentId, jobId: job.id, vendorId, tradeId,
        scheduledStartAt, outcome, onTime,
      });
      // NOTE: status-history timeline + presence rows are written in P3,
      // which consumes these PlannedAssignment records (it has the outcome+timing).
    }

    plannedVendors.push({ vendorId, vendorCode, archetype: akey, tradeIds, assignments });
  }

  return {
    tenantId, clientId: client.id, locationId: location.id, seedUserId,
    vendors: plannedVendors, createdAt: new Date().toISOString(),
  };
}
