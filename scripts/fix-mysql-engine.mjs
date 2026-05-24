// Post-process Drizzle Kit MySQL migrations to force ENGINE=InnoDB.
//
// Why: MariaDB on Namecheap shared hosting defaults to MyISAM, which
// silently drops foreign keys. Drizzle Kit's MySQL generator does not
// emit an explicit ENGINE clause, so we rewrite bare `);` table closers
// to `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`.
//
// Idempotent: already-rewritten lines no longer match the pattern.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = "db/migrations";
const PATTERN = /^\);$/gm;
const REPLACEMENT = ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

let touchedFiles = 0;
let totalReplacements = 0;

for (const file of files) {
  const path = join(MIGRATIONS_DIR, file);
  const original = readFileSync(path, "utf8");
  const matches = original.match(PATTERN);
  if (!matches) continue;
  const next = original.replace(PATTERN, REPLACEMENT);
  writeFileSync(path, next);
  console.log(`${file}: +${matches.length} ENGINE=InnoDB`);
  touchedFiles += 1;
  totalReplacements += matches.length;
}

if (touchedFiles === 0) {
  console.log("fix-mysql-engine: nothing to do");
} else {
  console.log(`fix-mysql-engine: ${touchedFiles} file(s), ${totalReplacements} table(s) updated`);
}
