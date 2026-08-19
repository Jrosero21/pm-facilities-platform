// B slice 1 seed: each tenant's line-item type definitions, taken from BUILT_IN_LINE_ITEM_TYPES.
//
// This is the migration the bank asks for — "MIGRATE the existing enum values in as each tenant's
// DEFAULTS, so nothing existing breaks and the current behaviour is reproduced by config rather
// than by code." The eight rows per tenant are exactly today's line_item_category enum, carrying
// the meaning that used to live in client-rates.ts: labor prices from an hourly rate, trip from a
// trip_charge, the other six wait for operator judgment.
//
// IDEMPOTENT, keyed on the (tenant_id, key) unique index. Re-running inserts only what is missing
// and NEVER overwrites an existing row — a tenant who has renamed a label or reordered their list
// keeps their edits. That is deliberate: this seed must be safe to run after tenants start
// customising, not just on a virgin database.
//
// Nothing reads this table yet. The enum still governs the four line-item tables; the definitions
// exist so the NEXT slice can switch validation and the pickers over to data.
//
// Run:
//   pnpm db:seed:line-item-types

import { db } from "@/server/db";
import { BUILT_IN_LINE_ITEM_TYPES } from "@/server/billing/line-item-types";
import { tenantLineItemTypes, tenants } from "@/server/schema";

async function main(): Promise<void> {
  const allTenants = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  if (allTenants.length === 0) {
    console.log("[line-item-types] no tenants — nothing to seed");
    return;
  }

  let inserted = 0;
  for (const tenant of allTenants) {
    const rows = BUILT_IN_LINE_ITEM_TYPES.map((def) => ({
      tenantId: tenant.id,
      key: def.key,
      label: def.label,
      pricingModel: def.pricingModel,
      defaultRateType: def.defaultRateType,
      displayOrder: def.displayOrder,
    }));

    // onConflictDoNothing on (tenant_id, key): existing rows keep every edit a tenant has made.
    const result = await db.insert(tenantLineItemTypes).values(rows).onConflictDoNothing({
      target: [tenantLineItemTypes.tenantId, tenantLineItemTypes.key],
    });
    const n = result.rowCount ?? 0;
    inserted += n;
    console.log(`[line-item-types] ${tenant.name}: ${n} inserted (${rows.length - n} already present)`);
  }

  console.log(`[line-item-types] done — ${inserted} row(s) inserted across ${allTenants.length} tenant(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[line-item-types] FAILED", err);
    process.exit(1);
  });
