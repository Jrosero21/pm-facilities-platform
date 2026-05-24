# Phase 1 — Admin SOP

Operational procedures for a developer/administrator running the platform locally in Phase 1.

## SOP-1.A — Local environment setup
1. Open the SSH tunnel to the database (separate terminal, keep it running):
   ```bash
   ssh -p 21098 -L 3307:127.0.0.1:3306 jonnyrosero@host62.registrar-servers.com
   ```
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — `mysql://jonnyrosero_jonny:<url-encoded-password>@127.0.0.1:3307/jonnyrosero_pm`
   - `BETTER_AUTH_SECRET` — generate with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
   - `BETTER_AUTH_URL` — `http://localhost:3000` for local dev.
3. Install dependencies:
   ```bash
   pnpm install
   ```

## SOP-1.B — Apply database migrations
```bash
pnpm db:generate   # regenerate SQL from schema (auto-runs the InnoDB post-fix)
pnpm db:migrate    # apply pending migrations to the live DB
```
- `db:generate` runs `scripts/fix-mysql-engine.mjs` automatically. If you ever hand-edit or hand-author a migration, run `node scripts/fix-mysql-engine.mjs` before applying so tables are InnoDB.
- Inspect a generated migration before applying it.

## SOP-1.C — Seed the first tenant and super_admin
1. Add to `.env.local`:
   ```
   SEED_ADMIN_PASSWORD=<8+ char password>
   ```
   Optional overrides: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, `SEED_TENANT_NAME`, `SEED_TENANT_SLUG`.
2. Run:
   ```bash
   pnpm db:seed
   ```
3. The seed is idempotent — re-running skips rows that already exist. It creates the 6 base roles, the aggregator tenant, the super_admin user, the membership, and the role grants.

## SOP-1.D — Run the app
```bash
pnpm dev          # http://localhost:3000
pnpm build        # production build (also typechecks)
pnpm lint         # eslint
pnpm db:studio    # Drizzle Studio, to browse the DB
```

## SOP-1.E — Verify auth and tenancy
```bash
# unauthenticated /dashboard should redirect to /login
curl -sI -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/dashboard

# inspect seeded data
mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm -e \
  "SELECT email FROM users; SELECT slug,type FROM tenants; SELECT \`key\`,scope FROM roles;"

# after a login, confirm an audit row
mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm -e \
  "SELECT action,user_id,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
```

## SOP-1.F — Add another user (interim, no invite UI yet)
Until the invitation flow exists, add a user the same way the seed does: create the better-auth user, insert a `tenant_users` row, and insert the appropriate `user_roles` grant. The cleanest path is to extend `db/seeds/initial.ts` or write a one-off `tsx` script that reuses `auth.api.signUpEmail` and the Drizzle tables. Never insert a raw password hash by hand — let better-auth hash it.
