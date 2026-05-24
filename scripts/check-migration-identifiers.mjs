// Guard against MySQL's 64-character identifier limit in generated migrations.
//
// Why: MySQL/MariaDB silently rejects ANY identifier over 64 chars — table,
// column, index, or constraint names alike. Drizzle auto-generates long
// constraint/index names (e.g.
// `client_location_access_notes_client_location_id_client_locations_id_fk`,
// 70 chars). An over-long name aborts the migration mid-apply, leaving it
// partially applied and unrecorded in __drizzle_migrations. This check fails
// loudly at generate time so the name can be fixed before db:migrate.
//
// Runs as part of `pnpm db:generate`, after the InnoDB post-fix.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "db/migrations";
const MAX = 64;

/** Classify how an identifier is introduced in the SQL, to tailor the fix hint. */
function classify(sql, identifier) {
  const esc = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp("CREATE TABLE\\s+`" + esc + "`", "i").test(sql)) return "table";
  if (new RegExp("CONSTRAINT\\s+`" + esc + "`", "i").test(sql)) return "constraint";
  if (new RegExp("(?:UNIQUE\\s+)?INDEX\\s+`" + esc + "`", "i").test(sql)) return "index";
  // A column is introduced at the start of a line inside the CREATE TABLE body.
  if (new RegExp("^\\s*`" + esc + "`\\s", "m").test(sql)) return "column";
  return "identifier";
}

const HINTS = {
  table:
    "Shorten the table name (the first arg to mysqlTable) in the Drizzle schema.",
  column:
    "Shorten the column name (the first arg to the column builder) in the Drizzle schema.",
  constraint:
    "Give the constraint an explicit short name in the Drizzle schema — e.g. " +
    "foreignKey({ columns, foreignColumns, name: \"short_fk\" }) or unique(\"short_uq\"). " +
    "Drizzle's auto-generated {table}_{col}_{reftable}_{refcol}_fk names are the usual culprit; " +
    "if you can't shorten the name, shorten the table/column names it is built from.",
  index:
    "Give the index an explicit short name in the Drizzle schema — e.g. index(\"short_idx\").on(...).",
  identifier:
    "Shorten this identifier, or give it an explicit short name in the Drizzle schema.",
};

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

const seen = new Set();
const offenders = [];
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  const tokens = sql.match(/`[^`]+`/g) ?? [];
  for (const token of tokens) {
    const identifier = token.slice(1, -1);
    if (identifier.length <= MAX) continue;
    const key = `${file}:${identifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offenders.push({ file, identifier, length: identifier.length, kind: classify(sql, identifier) });
  }
}

if (offenders.length > 0) {
  console.error(
    `\ncheck-migration-identifiers: FAILED — ${offenders.length} identifier(s) exceed MySQL's ${MAX}-char limit.\n` +
      "MySQL silently rejects these, aborting the migration mid-apply (partial, unrecorded state).\n",
  );
  for (const o of offenders) {
    console.error(`  • [${o.kind}] ${o.length} chars  in ${o.file}`);
    console.error(`      name: ${o.identifier}`);
    console.error(`      fix:  ${HINTS[o.kind]}`);
  }
  console.error("\nAfter fixing the schema, delete the bad migration + snapshot, revert _journal.json, then re-run pnpm db:generate.\n");
  process.exit(1);
}

console.log(`check-migration-identifiers: OK — all identifiers <= ${MAX} chars`);
