/**
 * Run the client_locations.timezone backfill.
 *
 *   dry run : pnpm tsx --env-file=.env.local --conditions=react-server scripts/backfill-location-timezones.ts
 *   apply   : ... scripts/backfill-location-timezones.ts --apply
 *
 * Prints the target database first — an empty connection string silently connects to a LOCAL
 * default rather than failing, so the target is confirmed out loud before anything is written.
 */
async function main() {
  const apply = process.argv.includes("--apply");

  const { db } = await import("@/server/db");
  const { sql } = await import("drizzle-orm");
  const { backfillLocationTimezones } = await import("@/server/backfill-location-timezones");
  const { tenants: tenantsTable } = await import("@/server/schema");

  const dbNameRes = await db.execute(sql`select current_database() as name`);
  const dbName = (dbNameRes.rows[0] as { name: string }).name;
  console.log(`[backfill-tz] target database : ${dbName}`);
  console.log(`[backfill-tz] mode            : ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);

  if (apply && dbName !== "pm") {
    console.error(`[backfill-tz] refusing: --apply is local-only here (got "${dbName}").`);
    console.error("[backfill-tz] prod is a separate gated step.");
    process.exit(2);
  }

  const tenants = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable);
  let totals = { candidates: 0, updated: 0, skipped: 0, approximate: 0 };

  for (const t of tenants) {
    const res = await backfillLocationTimezones({
      tenantId: t.id,
      dryRun: !apply,
      actorLabel: "script:backfill-location-timezones",
    });
    if (res.candidates === 0) continue;

    console.log(`\n[backfill-tz] tenant ${t.name} (${t.id})`);
    for (const r of res.rows) {
      const verdict = r.timezone
        ? `-> ${r.timezone}${r.approximate ? "   ★ APPROXIMATE (multi-zone state)" : ""}`
        : "-> (unresolved: left NULL, display falls back + labels)";
      console.log(`   ${r.stateProvince}  ${r.locationName.padEnd(34)} ${verdict}`);
    }
    console.log(
      `   candidates=${res.candidates} updated=${res.updated} skipped=${res.skipped} approximate=${res.approximate}`,
    );
    totals = {
      candidates: totals.candidates + res.candidates,
      updated: totals.updated + res.updated,
      skipped: totals.skipped + res.skipped,
      approximate: totals.approximate + res.approximate,
    };
  }

  console.log(
    `\n[backfill-tz] TOTAL candidates=${totals.candidates} ${apply ? "updated" : "would update"}=${totals.updated} skipped=${totals.skipped} approximate=${totals.approximate}`,
  );
  if (!apply) console.log("[backfill-tz] dry run — nothing written. Re-run with --apply.");
  process.exit(0);
}

main().catch((e) => { console.error("[backfill-tz] ERROR:", e); process.exit(1); });
