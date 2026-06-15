// Phase 4 reference seed: priorities (per-tenant) + job_statuses (global) +
// tenant_job_sequences (per-tenant job_number counter).
//
// priorities are TENANT-SCOPED (D-4.1) — each tenant owns its set. The proper
// home is a "seed on tenant creation" hook once Phase 1's tenant-creation flow
// is formalized (carry-forward); for Phase 4 we hand-seed the existing Demo
// Aggregator tenant (slug "demo").
//
// job_statuses are GLOBAL (mirror trades) — seeded once across the whole DB,
// no tenant dimension.
//
// tenant_job_sequences gets one row per tenant (next_number=1) for job_number
// allocation (D-4.5). This is the eager seed; createJob also lazily ensures the
// row via ON DUPLICATE KEY as defense-in-depth.
//
// Idempotent: priorities keyed on (tenant_id, code); statuses keyed on code
// alone — a missing status is inserted, and an existing status's sort_order is
// reflowed to the desired value (ONLY sort_order; name/category/terminal left
// as-is). The sequence row is only created if missing (never resets an advanced
// counter). Safe to re-run; converges. Codes uppercased. No audit rows.
//
// Run:
//   pnpm db:seed:job-reference

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  jobStatuses,
  priorities,
  tenantJobSequences,
  tenants,
} from "@/server/schema";

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
  // Phase 19 follow-up (per-dispatch): operationally-complete-but-not-closed stage,
  // the auto-follow target when a single vendor reaches WORK_COMPLETE. NON-terminal
  // (billing/closeout still to come). Inserting it at sort 5 reflows ON_HOLD..CLOSED_BILLED
  // down by one (handled by the upsert loop below).
  {
    name: "Pending Invoice",
    code: "PENDING_INVOICE",
    category: "completed",
    sortOrder: 5,
    isTerminal: false,
    description: "Work is operationally complete; awaiting invoicing (accounting handoff).",
  },
  {
    name: "On Hold",
    code: "ON_HOLD",
    category: "on_hold",
    sortOrder: 6,
    isTerminal: false,
    description: "Work is paused pending parts, approval, access, or other blocker.",
  },
  {
    name: "Completed",
    code: "COMPLETED",
    category: "completed",
    sortOrder: 7,
    isTerminal: true,
    description:
      "Vendor has marked the work complete. Awaiting closeout, invoicing, or final review.",
  },
  {
    name: "Cancelled",
    code: "CANCELLED",
    category: "cancelled",
    sortOrder: 8,
    isTerminal: true,
    description: "Job was cancelled before work was completed. No invoicing expected.",
  },
  {
    name: "Closed",
    code: "CLOSED",
    category: "completed",
    sortOrder: 9,
    isTerminal: true,
    description:
      "Job is fully closed including all closeout documents, invoicing, and final review. No further activity expected.",
  },
  // Phase 8 (8b-D3): billing-close terminal, DISTINCT from the operational CLOSED
  // (OQ-26). Billing close is an accounting-gated, explicit human transition (#20/#21);
  // operational close and billing close are independent. Idempotent on code.
  {
    name: "Closed (Billed)",
    code: "CLOSED_BILLED",
    category: "completed",
    sortOrder: 10,
    isTerminal: true,
    description:
      "Billing is complete for the job (final invoice issued/paid). Distinct from operational CLOSED; reached via an explicit accounting-gated billing-close action.",
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

  // job_statuses are GLOBAL — keyed on code alone, no tenant dimension. A missing
  // status is inserted; an existing status's sort_order is reflowed to the desired
  // value (idempotent convergence — adding PENDING_INVOICE at sort 5 shifts
  // ON_HOLD..CLOSED_BILLED down by one). ONLY sort_order is touched on existing rows;
  // name / category / is_terminal are left as-is.
  let statusInserted = 0;
  let statusReflowed = 0;
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
    } else {
      await db
        .update(jobStatuses)
        .set({ sortOrder: s.sortOrder })
        .where(eq(jobStatuses.id, existing[0].id));
      statusReflowed += 1;
    }
  }
  console.log(
    `[seed:job-reference] job_statuses (global): ${statusInserted} inserted, ${statusReflowed} sort_order-reflowed`,
  );

  // tenant_job_sequences: one row per tenant for job_number allocation.
  // Only created if missing — never resets an already-advanced counter.
  const existingSeq = await db
    .select({ tenantId: tenantJobSequences.tenantId })
    .from(tenantJobSequences)
    .where(eq(tenantJobSequences.tenantId, tenant.id))
    .limit(1);
  if (existingSeq.length === 0) {
    await db.insert(tenantJobSequences).values({ tenantId: tenant.id, nextNumber: 1 });
    console.log("[seed:job-reference] tenant_job_sequences: created (next_number=1)");
  } else {
    console.log("[seed:job-reference] tenant_job_sequences: already present (left as-is)");
  }

  console.log("[seed:job-reference] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:job-reference] failed:", err);
    process.exit(1);
  });
