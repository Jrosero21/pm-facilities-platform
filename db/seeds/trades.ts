// Phase 3 reference seed: the global trades taxonomy.
//
// trades is a GLOBAL reference table (no tenant_id) — one platform-wide list so
// external_trade_mappings (roadmap §12) stays a 2-D matrix. This seeds a starter
// set of common facilities trades.
//
// Idempotent: keyed on `code`, safe to re-run. Existing trades are left as-is
// (this seed does not update name/status of trades already present). Codes are
// stored uppercased. Seed inserts intentionally write no audit row (bootstrap
// reference data, not operator-created).
//
// There is no operator UI for managing trades in Phase 3 — trades are seed-only
// and additive. A super_admin trades-management UI is deferred (see
// docs/phase-3-vendors/10-known-limitations.md). Current consumers
// (vendor_trade_coverage Phase 3, jobs Phase 4, dispatch Phase 5) only reference
// trades, never create them.
//
// Run:
//   pnpm db:seed:trades

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { trades } from "@/server/schema";

const starterTrades: { name: string; code: string }[] = [
  { name: "Plumbing", code: "PLUMB" },
  { name: "HVAC", code: "HVAC" },
  { name: "Electrical", code: "ELEC" },
  { name: "Carpentry", code: "CARP" },
  { name: "Locksmith", code: "LOCK" },
  { name: "Roofing", code: "ROOF" },
  { name: "Cleaning", code: "CLEAN" },
  { name: "Landscaping", code: "LAND" },
  { name: "Pest Control", code: "PEST" },
  { name: "Glass", code: "GLASS" },
  { name: "Painting", code: "PAINT" },
  { name: "Flooring", code: "FLOOR" },
  { name: "Door/Hardware", code: "DOOR" },
  { name: "Appliance Repair", code: "APPL" },
  { name: "General Handyman", code: "HANDY" },
];

async function main() {
  console.log("[seed:trades] starting");

  let inserted = 0;
  for (const trade of starterTrades) {
    const code = trade.code.trim().toUpperCase();
    const existing = await db
      .select({ id: trades.id })
      .from(trades)
      .where(eq(trades.code, code))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(trades).values({ name: trade.name, code });
      inserted += 1;
    }
  }

  console.log(
    `[seed:trades] ${inserted} inserted, ${starterTrades.length - inserted} already present`,
  );
  console.log("[seed:trades] done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:trades] failed:", err);
    process.exit(1);
  });
