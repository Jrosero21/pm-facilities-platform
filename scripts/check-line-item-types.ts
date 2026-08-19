// B slice 1 verification: the seeded DEFINITIONS reproduce the behaviour that used to be hardcoded.
//
// This slice's whole claim is "nothing changes". That claim only holds while three things agree:
//   1. the line_item_category ENUM (still the column type on all four line-item tables),
//   2. the BUILT_IN_LINE_ITEM_TYPES definitions in code,
//   3. the tenant_line_item_types ROWS in this database.
// A category present in the enum with no definition is a line item nobody can price; a definition
// whose default_rate_type disagrees with the code path is a silent pricing change. Both are
// invisible to tsc and to the unit tests, because both live in the database.
//
// Retire this check when the enum is dropped and the table becomes the only source (B slice 2+).
//
// Run:
//   pnpm db:check:line-item-types

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { BUILT_IN_LINE_ITEM_TYPES, defaultRateTypeForCategory } from "@/server/billing/line-item-types";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

async function main(): Promise<void> {
  // 1. enum values === definition keys, as SETS
  const enumRows = await db.execute<{ value: string }>(
    sql`select unnest(enum_range(NULL::line_item_category))::text as value`,
  );
  const enumValues = [...enumRows.rows.map((r) => r.value)].sort();
  const defKeys = [...BUILT_IN_LINE_ITEM_TYPES.map((d) => d.key)].sort();
  check("enum values match definition keys", JSON.stringify(enumValues) === JSON.stringify(defKeys), {
    enumValues,
    defKeys,
  });

  // 2. every tenant has a full set, and every stored row matches the code path exactly
  const tenantRows = await db.execute<{ tenant_id: string; n: number }>(
    sql`select tenant_id, count(*)::int as n from tenant_line_item_types group by tenant_id`,
  );
  for (const t of tenantRows.rows) {
    check(`tenant ${t.tenant_id} has all ${BUILT_IN_LINE_ITEM_TYPES.length} definitions`, Number(t.n) === BUILT_IN_LINE_ITEM_TYPES.length, t);
  }

  const stored = await db.execute<{ tenant_id: string; key: string; pricing_model: string; default_rate_type: string | null }>(
    sql`select tenant_id, key, pricing_model, default_rate_type from tenant_line_item_types`,
  );
  for (const row of stored.rows) {
    const expected = defaultRateTypeForCategory(row.key);
    check(
      `${row.key}: stored default_rate_type reproduces the code path (${expected ?? "null"})`,
      (row.default_rate_type ?? null) === expected,
      row,
    );
    const def = BUILT_IN_LINE_ITEM_TYPES.find((d) => d.key === row.key);
    check(`${row.key}: stored pricing_model matches the definition`, !!def && def.pricingModel === row.pricing_model, row);
  }

  // 3. no tenant is missing entirely — a tenant with zero definitions cannot price anything later
  const missing = await db.execute<{ id: string; name: string }>(
    sql`select t.id, t.name from tenants t
        where not exists (select 1 from tenant_line_item_types l where l.tenant_id = t.id)`,
  );
  check("every tenant has definitions seeded", missing.rows.length === 0, missing.rows);

  console.log(failures === 0 ? "LINE ITEM TYPES OK" : `FAILED ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[check-line-item-types] FAILED", err);
  process.exit(1);
});
