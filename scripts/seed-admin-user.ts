// Seed the admin user via Better Auth's real server-side sign-up (proper password hash + account row) —
// invite-only, no UI signup. Targets pg `pm` (the app DB). NOT a raw insert.
//
// Run (Jonny provides the password so it's never in files/history):
//   ADMIN_PASSWORD='<his password>' pnpm tsx --conditions=react-server scripts/seed-admin-user.ts
//
// Reads: ADMIN_EMAIL (default jnrosero@gmail.com), ADMIN_PASSWORD (REQUIRED), ADMIN_NAME (default Jonny Rosero).
// Idempotent-ish: if the user already exists, reports it rather than hard-failing.
import { config } from "dotenv";
config({ path: ".env.local" }); // load pg DATABASE_URL for `pm` (dotenv won't override an already-set shell var)

const email = process.env.ADMIN_EMAIL ?? "jnrosero@gmail.com";
const name = process.env.ADMIN_NAME ?? "Jonny Rosero";
const password = process.env.ADMIN_PASSWORD;

async function main() {
  // Password check FIRST — before importing the (server-only) auth module, so a no-password run refuses
  // cleanly without any DB connection or server-only import.
  if (!password) {
    console.error("[seed-admin] ADMIN_PASSWORD is required — set it and re-run. Refusing (no user created).");
    console.error("[seed-admin]   ADMIN_PASSWORD='<password>' pnpm tsx --conditions=react-server scripts/seed-admin-user.ts");
    process.exit(2);
  }

  const url = process.env.DATABASE_URL ?? "";
  if (!url) { console.error("[seed-admin] DATABASE_URL not set (expected pg pm from .env.local)."); process.exit(2); }
  if (url.startsWith("mysql")) {
    console.error("[seed-admin] DATABASE_URL is MySQL — refusing. This seed targets the pg `pm` database."); process.exit(2);
  }
  if (url.includes("_sandbox")) {
    console.error("[seed-admin] DATABASE_URL targets a *_sandbox DB — refusing. The admin belongs in pg `pm`, not sandbox."); process.exit(2);
  }
  const host = url.split("@")[1]?.split("?")[0] ?? "?";
  console.log(`[seed-admin] target: ${host}  email: ${email}`);

  const { auth } = await import("@/server/auth");
  try {
    const res = await auth.api.signUpEmail({ body: { email, password, name }, headers: new Headers() });
    const created = (res as { user?: { id?: string; email?: string } })?.user;
    if (created?.email === email) {
      console.log(`[seed-admin] CREATED via Better Auth sign-up: ${created.email} (id ${created.id}) — hashed password + account row written.`);
      process.exit(0);
    }
    console.error("[seed-admin] sign-up returned no user — unexpected:", JSON.stringify(res)); process.exit(1);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already\s*exist|USER_ALREADY|duplicate|unique/i.test(msg)) {
      console.log(`[seed-admin] user ${email} already exists — nothing to do (idempotent).`);
      process.exit(0);
    }
    console.error("[seed-admin] FAILED:", msg); process.exit(1);
  }
}
main();
