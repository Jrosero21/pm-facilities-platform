// Phase 4 reference seed: priorities (per-tenant) + job_statuses (global).
//
// priorities are TENANT-SCOPED (D-4.1) — each tenant owns its set. The proper
// home is a "seed on tenant creation" hook once Phase 1's tenant-creation flow
// is formalized (carry-forward); for Phase 4 we hand-seed the existing Demo
// Aggregator tenant (slug "demo").
//
// job_statuses are GLOBAL (mirror trades) — seeded once across the whole DB,
// no tenant dimension.
//
// Idempotent: priorities keyed on (tenant_id, code); statuses keyed on code
// alone. Safe to re-run; existing rows left as-is. Codes uppercased. No audit
// rows (bootstrap reference data).
//
// Run:
//   pnpm db:seed:job-reference

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { jobStatuses, priorities, tenants } from "@/server/schema";

const TENANT_SLUG = process.env.SEED_TENANT_SLUG ?? "demo";

const starterPriorities: {
  name: string;
  code: string;
  rank: number;
  description: string;
}[] = [
  {
    name: "Emergency",
    code: "EMERGENCY",
    rank: 1,
    description:
      "Life-safety issue or business-stopping outage. Immediate response required.",
  },
  {
    name: "Urgent",
    code: "URGENT",
    rank: 2,
    description: "Significant operational impact requiring same-day response.",
  },
  {
    name: "High",
    code: "HIGH",
    rank: 3,
    description: "Material business impact requiring response within 1 business day.",
  },
  {
    name: "Routine",
    code: "ROUTINE",
    rank: 4,
    description: "Standard work order with no immediate operational impact.",
  },
  {
    name: "Scheduled",
    code: "SCHEDULED",
    rank: 5,
    description: "Planned work scheduled in advance — not reactive.",
  },
];

type Category = "open" | "in_progress" | "on_hold" | "completed" | "cancelled";
const starterStatuses: {
  name: string;
  code: string;
  category: Category;
  sortOrder: number;
  isTerminal: boolean;
  description: string;
}[] = [
  {
    name: "New",
    code: "NEW",
    category: "open",
    sortOrder: 1,
    isTerminal: false,
    description: "Job has been created but not yet scheduled or assigned to a vendor.",
  },
  {
    name: "Scheduled",
    code: "SCHEDULED",
    category: "open",
    sortOrder: 2,
    isTerminal: false,
    description: "Job has a scheduled service date but no vendor has been dispatched yet.",
  },
  {
    name: "Dispatched",
    code: "DISPATCHED",
    category: "in_progress",
    sortOrder: 3,
    isTerminal: false,
    description:
      "Vendor has been notified and has accepted the assignment. Work has not yet started.",
  },
  {
    name: "In Progress",
    code: "IN_PROGRESS",
    category: "in_progress",
    sortOrder: 4,
    isTerminal: false,
    description: "Technician is on site or actively performing work.",
  },
  {
    name: "On Hold",
    code: "ON_HOLD",
    category: "on_hold",
    sortOrder: 5,
    isTerminal: false,
    description: "Work is paused pending parts, approval, access, or other blocker.",
  },
  {
    name: "Completed",
    code: "COMPLETED",
    category: "completed",
    sortOrder: 6,
    isTerminal: true,
    description:
      "Vendor has marked the work complete. Awaiting closeout, invoicing, or final review.",
  },
  {
    name: "Cancelled",
    code: "CANCELLED",
    category: "cancelled",
    sortOrder: 7,
    isTerminal: true,
    description: "Job was cancelled before work was completed. No invoicing expected.",
  },
  {
    name: "Closed",
    code: "CLOSED",
    category: "completed",
    sortOrder: 8,
    isTerminal: true,
    description:
      "Job is fully closed including all closeout documents, invoicing, and final review. No further activity expected.",
  },
];

async function main() {
  console.log(`[seed:job-reference] starting (tenant slug "${TENANT_SLUG}")`);

  const tenant = (
    await db.select().from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1)
  )[0];
  if (!tenant) {
    console.error(`[seed:job-reference] tenant "${TENANT_SLUG}" not found — aborting.`);
    process.exit(1);
  }

  let prioInserted = 0;
  for (const p of starterPriorities) {
    const code = p.code.trim().toUpperCase();
    const existing = await db
      .select({ id: priorities.id })
      .from(priorities)
      .where(and(eq(priorities.tenantId, tenant.id), eq(priorities.code, code)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(priorities).values({
        tenantId: tenant.id,
        name: p.name,
        description: p.description,
        code,
        rank: p.rank,
      });
      prioInserted += 1;
    }
  }
  console.log(
    `[seed:job-reference] priorities: ${prioInserted} inserted, ${starterPriorities.length - prioInserted} already present`,
  );

  // job_statuses are GLOBAL — keyed on code alone, no tenant dimension.
  let statusInserted = 0;
  for (const s of starterStatuses) {
    const code = s.code.trim().toUpperCase();
    const existing = await db
      .select({ id: jobStatuses.id })
      .from(jobStatuses)
      .where(eq(jobStatuses.code, code))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(jobStatuses).values({
        name: s.name,
        description: s.description,
        code,
        category: s.category,
        sortOrder: s.sortOrder,
        isTerminal: s.isTerminal,
      });
      statusInserted += 1;
    }
  }
  console.log(
    `[seed:job-reference] job_statuses (global): ${statusInserted} inserted, ${starterStatuses.length - statusInserted} already present`,
  );
  console.log("[seed:job-reference] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:job-reference] failed:", err);
    process.exit(1);
  });
