-- db/migrations/0007_apply_prod.sql — idempotent prod-apply of migration 0007.
--
-- WHY A SECOND FILE. db/migrations/0007_parched_mystique.sql is drizzle-generated and drizzle owns
-- it: bare CREATE TYPE / CREATE TABLE / ALTER ... ADD CONSTRAINT, none of them re-runnable. That
-- file must stay byte-identical to what generated meta/0007_snapshot.json. This file is the
-- OPERATOR-RUN twin: same objects, same names, guarded so a re-run is a no-op.
--
-- EQUIVALENCE. Verified field-by-field against meta/0007_snapshot.json — 9 columns, the
-- 'judgment' / 0 / now() defaults, the FK name + ON DELETE cascade, and the unique btree index.
-- The one deliberate difference is SHAPE, not RESULT: the FK is inlined as a table constraint
-- rather than a follow-on ALTER, because ALTER ... ADD CONSTRAINT has no IF NOT EXISTS. The
-- constraint name is spelled out, so the catalog ends up identical either way.
--
-- CREATE TYPE has no IF NOT EXISTS in ANY Postgres version (checked against Neon's 18.4) — hence
-- the DO block. Everything else uses IF NOT EXISTS.
--
-- PURELY ADDITIVE: new enum, new table. No existing column is altered, and no runtime code path
-- reads tenant_line_item_types yet (only db/seeds/line-item-types.ts and
-- scripts/check-line-item-types.ts), so this can land before or after the branch merge without a
-- window in which prod is broken.
--
-- Apply convention (house rule): direct DDL, sandbox -> verify -> prod. NEVER `drizzle-kit migrate`
-- — the __drizzle_migrations ledger undercounts and a replay produces duplicate-column errors.
--
-- Run (confirm the target FIRST — an empty connection string silently falls back to a local DB):
--   neon=$(grep -m1 -E '^DATABASE_URL_NEON=' .env.local | cut -d= -f2- | tr -d '"')
--   [ -n "$neon" ] || { echo "empty connection string — abort"; exit 1; }
--   psql "$neon" -v ON_ERROR_STOP=1 -c "SELECT current_database();"   # must print neondb
--   psql "$neon" -v ON_ERROR_STOP=1 -f db/migrations/0007_apply_prod.sql
--
-- Sandbox already carries both objects (applied during B slice 1), so prod is the only target left.

BEGIN;

-- 1. The pricing-model enum. deterministic = prices from a rate; judgment = waits for an operator.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'line_item_pricing_model') THEN
    CREATE TYPE "public"."line_item_pricing_model" AS ENUM('deterministic', 'judgment');
  END IF;
END $$;

-- 2. The per-tenant line-item type definitions. `key` is stable and never renamed (line items point
--    at it); `label` is freely editable. Keeping those apart is the platform principle's rule (c).
CREATE TABLE IF NOT EXISTS "tenant_line_item_types" (
  "id"                varchar(36) PRIMARY KEY NOT NULL,
  "tenant_id"         varchar(36) NOT NULL,
  "key"               varchar(64) NOT NULL,
  "label"             varchar(128) NOT NULL,
  "pricing_model"     "line_item_pricing_model" DEFAULT 'judgment' NOT NULL,
  "default_rate_type" varchar(32),
  "display_order"     integer DEFAULT 0 NOT NULL,
  "created_at"        timestamp DEFAULT now() NOT NULL,
  "updated_at"        timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tenant_line_item_types_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action
);

-- 3. One definition per (tenant, key) — the seed's ON CONFLICT target, which is what makes
--    db/seeds/line-item-types.ts idempotent and non-overwriting.
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_line_item_types_tenant_key_uq"
  ON "tenant_line_item_types" USING btree ("tenant_id", "key");

COMMIT;

-- Verify (expect: table present, 9 columns, 2 enum values, FK -> tenants ON DELETE c, index unique):
--   SELECT to_regclass('public.tenant_line_item_types');
--   SELECT count(*) FROM information_schema.columns WHERE table_name = 'tenant_line_item_types';
--   SELECT unnest(enum_range(NULL::line_item_pricing_model))::text;
--
-- AFTER applying, seed the definitions — a SEPARATE step behind a separate gate. Note that
-- `pnpm db:seed:line-item-types` is hardcoded to --env-file=.env.local, i.e. it targets LOCAL.
-- Seeding prod means invoking it with an explicit DATABASE_URL override; no unguarded :prod script
-- is provided for it on purpose, because that seed has no target guard of its own.
