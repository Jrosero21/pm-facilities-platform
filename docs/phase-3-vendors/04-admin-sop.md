# Phase 3 — Admin / Internal SOP

Developer/administrator procedures introduced or changed in Phase 3. Builds on Phase 1/2 SOPs (env setup, seeding, running the app, the migration pipeline).

> **Prerequisites for every `mysql` command below:** the SSH tunnel must be open and `MYSQL_PWD` exported in your shell (Phase 1 SOP-1.A). Throughout this file, `mysql ...` is shorthand for `mysql --protocol=tcp -h 127.0.0.1 -P 3307 -u jonnyrosero_jonny jonnyrosero_pm`.

## SOP-3.A — Seed the global trades list
```bash
pnpm db:seed:trades   # tsx db/seeds/trades.ts — idempotent on `code`
```
- Inserts the 15 starter trades (Plumbing, HVAC, Electrical, Carpentry, Locksmith, Roofing, Cleaning, Landscaping, Pest Control, Glass, Painting, Flooring, Door/Hardware, Appliance Repair, General Handyman). Codes are uppercased; existing codes are skipped (safe to re-run; additive only — never overwrites name/status of an existing trade).
- `trades` is **global** (no `tenant_id`); seeding writes **no** `audit_logs` rows. There is no operator UI to add trades — to extend the list, add rows here (or directly, uppercase `code`) and re-run.

## SOP-3.B — Apply the Phase 3 migrations
```bash
pnpm db:generate   # drizzle-kit generate → fix-mysql-engine → check-migration-identifiers
pnpm db:migrate    # apply pending migrations
```
- Phase 3 added migrations `0003` (vendor spine + trades), `0004` (vendor name index → non-unique), `0005` (coverage tables), `0006` (schema-only detail tables). Total recorded migrations after Phase 3: **7**.
- The two `vendor_location_id` FKs on the coverage tables use explicit short names (`vtc_location_fk`, `vsa_location_fk`) — their auto-generated names neared the 64-char limit. Always inspect generated SQL before `db:migrate` (Phase 2 SOP-2.A), and recover a partial migration via Phase 2 SOP-2.B.

## SOP-3.C — Verify the `trade_id` RESTRICT FKs (the project's only delete exception)
```bash
mysql ... -e "SELECT rc.TABLE_NAME, rc.CONSTRAINT_NAME, rc.DELETE_RULE
  FROM information_schema.REFERENTIAL_CONSTRAINTS rc
  JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
  WHERE rc.CONSTRAINT_SCHEMA='jonnyrosero_pm' AND kcu.REFERENCED_TABLE_NAME='trades';"
# expect vendor_trade_coverage / vendor_rates / vendor_performance_scores trade_id → RESTRICT
```

## SOP-3.D — Light up a schema-only vendor table later
`vendor_rates`, `vendor_documents`, `vendor_compliance`, `vendor_performance_scores` have schema but no data layer/UI. To wire one up: add a `src/server/<entity>.ts` data layer (tenant-scoped, parent-in-tenant guard via `getVendor`, audit on write), a server action, and screens under `(app)`. Follow the create+read pattern in `vendor-trade-coverage.ts` / `vendor-service-areas.ts`. For `vendor_documents`, file upload also requires storage infrastructure (not yet present — `file_url`/`file_size_bytes`/`file_mime_type` stay null until then).

## SOP-3.E — Add contacts to a new entity in a future phase
The `ContactForm` and `ContactList` components and the `ContactActionState` contract are domain-neutral (Phase 3 generalization). To add contact support to a new entity (e.g. `job_contacts` in Phase 4):
1. Create a `src/server/<entity>-contacts.ts` data layer mirroring `src/server/vendor-contacts.ts` (tenant-scoped queries, parent-in-tenant guard via the entity's `get<Entity>`, audit `<entity>_contact.created`).
2. Create a `src/app/(app)/<entity>/contact-actions.ts` server-action file mirroring `src/app/(app)/vendors/contact-actions.ts`. Import `ContactActionState` from `@/components/contact-form` — do NOT re-declare it.
3. On the entity's detail page, bind the action: `addContact = create<Entity>ContactAction.bind(null, entityId)`, then render `<ContactList contacts={contacts} />` + `<ContactForm action={addContact} />`. No new components needed.

The same pattern works for `LocationForm` / `LocationActionState` (Phase 3 generalized both). One-way dependency: components own the action-state types; domain action files import them.

## SOP-3.F — Inspect Phase 3 data
```bash
mysql ... -e "SELECT name, vendor_code, vendor_type, status FROM vendors;"
mysql ... -e "SELECT v.name, t.code AS trade, c.is_primary, c.vendor_location_id IS NOT NULL AS branch_scoped
  FROM vendor_trade_coverage c JOIN vendors v ON v.id=c.vendor_id JOIN trades t ON t.id=c.trade_id;"
mysql ... -e "SELECT v.name, a.area_type, a.area_label, a.state_code, a.radius_miles
  FROM vendor_service_areas a JOIN vendors v ON v.id=a.vendor_id ORDER BY v.name, a.area_type;"
mysql ... -e "SELECT action, target_type, created_at FROM audit_logs WHERE action LIKE 'vendor%' ORDER BY created_at DESC;"
```
