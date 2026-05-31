/**
 * scripts/seed-system-user.ts — Phase 12 (12h-B.0)
 *
 * Creates the GLOBAL system/integration user (SF-1) that owns system-originated ingest
 * records (external WO → createJob / auto-created locations). A service identity that
 * NEVER authenticates: a direct `users` insert (id=uuidv7, email, name, email_verified=1)
 * with NO accounts/password row — deliberately NOT better-auth signUpEmail (which is for
 * login users). IDEMPOTENT: find-by-email; re-running does not duplicate.
 *
 * Target is whatever DATABASE_URL points to — set the sandbox override before running for
 * sandbox; run with the default (prod) URL for prod. Mirrors the seed env discipline:
 * db is dynamically imported AFTER the URL is in place.
 *
 * Run (sandbox):
 *   export DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.local | cut -d= -f2- | sed -E 's#/jonnyrosero_pm(\?|$)#/jonnyrosero_pm_sandbox\1#')"
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/seed-system-user.ts
 * Run (prod): same without the sandbox override.
 */
import { v7 as uuidv7 } from "uuid";
import { eq } from "drizzle-orm";

const { db } = await import("@/server/db");
const { users } = await import("@/server/schema");
const { SYSTEM_USER_EMAIL, SYSTEM_USER_NAME } = await import(
  "@/server/integrations/system-user"
);

async function main() {
  const target = (process.env.DATABASE_URL ?? "").replace(/.*@/, "...@");
  console.log(`[seed-system-user] target: ${target}`);

  const existing = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, SYSTEM_USER_EMAIL))
      .limit(1)
  )[0];

  if (existing) {
    console.log(`[seed-system-user] reused: ${SYSTEM_USER_EMAIL} -> ${existing.id}`);
    process.exit(0);
  }

  const id = uuidv7();
  await db.insert(users).values({
    id,
    email: SYSTEM_USER_EMAIL,
    name: SYSTEM_USER_NAME,
    emailVerified: true,
  });
  console.log(`[seed-system-user] created: ${SYSTEM_USER_EMAIL} -> ${id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed-system-user] FAILED:", e);
  process.exit(1);
});
