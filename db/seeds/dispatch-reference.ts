// Phase 5 reference seed: dispatch_assignment_statuses (global).
//
// dispatch_assignment_statuses is GLOBAL (mirrors job_statuses / trades) — seeded
// once across the whole DB, no tenant dimension (D-4.1). createDispatch resolves
// the initial status by code ('DRAFT') via getDispatchAssignmentStatusByCode.
//
// 9 statuses (roadmap §8 Phase 5). `category` groups them operationally; declined
// and cancelled share the `cancelled` category (lock (a)) but stay distinct codes.
// is_terminal marks end states (declined / work_complete / cancelled).
//
// Idempotent: keyed on code alone (global). Safe to re-run; existing rows left
// as-is. Codes uppercased. No audit rows (bootstrap reference data).
//
// Run:
//   pnpm db:seed:dispatch-reference

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { dispatchAssignmentStatuses } from "@/server/schema";

type Category = "draft" | "pending" | "active" | "completed" | "cancelled";

const starterStatuses: {
  name: string;
  code: string;
  category: Category;
  sortOrder: number;
  isTerminal: boolean;
  description: string;
}[] = [
  {
    name: "Draft",
    code: "DRAFT",
    category: "draft",
    sortOrder: 10,
    isTerminal: false,
    description:
      "Dispatch created but not yet sent to the vendor — operator workspace, not visible on the job timeline.",
  },
  {
    name: "Sent",
    code: "SENT",
    category: "pending",
    sortOrder: 20,
    isTerminal: false,
    description: "Dispatch has been sent to the vendor; awaiting their response.",
  },
  {
    name: "Accepted",
    code: "ACCEPTED",
    category: "active",
    sortOrder: 30,
    isTerminal: false,
    description: "Vendor has accepted the dispatch.",
  },
  {
    name: "Vendor Declined",
    code: "DECLINED",
    category: "cancelled",
    sortOrder: 40,
    isTerminal: true,
    description:
      "Vendor declined the dispatch. Distinct code from Cancelled (decline-rate is reportable), same operational category.",
  },
  {
    name: "Scheduled",
    code: "SCHEDULED",
    category: "active",
    sortOrder: 50,
    isTerminal: false,
    description: "A service visit has been scheduled with the vendor.",
  },
  {
    name: "Confirmed",
    code: "CONFIRMED",
    category: "active",
    sortOrder: 60,
    isTerminal: false,
    description: "Vendor has confirmed the scheduled visit / ETA.",
  },
  {
    name: "On Site",
    code: "ON_SITE",
    category: "active",
    sortOrder: 70,
    isTerminal: false,
    description: "Vendor has checked in and is on site.",
  },
  {
    name: "Work Complete",
    code: "WORK_COMPLETE",
    category: "completed",
    sortOrder: 80,
    isTerminal: true,
    description:
      "Vendor has checked out and reported the work complete. Billing/closeout is handled at the job level (Phase 8).",
  },
  {
    name: "Cancelled",
    code: "CANCELLED",
    category: "cancelled",
    sortOrder: 90,
    isTerminal: true,
    description: "Dispatch was cancelled by the operator before completion.",
  },
];

async function main() {
  console.log("[seed:dispatch-reference] starting (global)");

  let inserted = 0;
  for (const s of starterStatuses) {
    const code = s.code.trim().toUpperCase();
    const existing = await db
      .select({ id: dispatchAssignmentStatuses.id })
      .from(dispatchAssignmentStatuses)
      .where(eq(dispatchAssignmentStatuses.code, code))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(dispatchAssignmentStatuses).values({
        name: s.name,
        description: s.description,
        code,
        category: s.category,
        sortOrder: s.sortOrder,
        isTerminal: s.isTerminal,
      });
      inserted += 1;
    }
  }
  console.log(
    `[seed:dispatch-reference] dispatch_assignment_statuses (global): ${inserted} inserted, ${starterStatuses.length - inserted} already present`,
  );

  console.log("[seed:dispatch-reference] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:dispatch-reference] failed:", err);
    process.exit(1);
  });
