import { integer, pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { lineItemPricingModel } from "./enums";
import { tenants } from "./tenants";

// ── B slice 1 — TENANT LINE-ITEM TYPE DEFINITIONS ──────────────────────────────────────
// The first instance of the platform principle "favor tenant-configurable over hardcoded":
// line_item_category is a pgEnum spread across FOUR line-item tables via baseLineItemColumns
// (proposal / change_order / vendor_invoice / client_invoice). This table is where that
// vocabulary starts moving out of code and into data.
//
// ★ THE POINT IS NOT THE DROPDOWN, IT IS THE MEANING. Today the code KNOWS what a category
// means: client-rates.ts:321 branches on "labor" to pick rate_type hourly, and the proposal
// editor (proposal-line-items-editor.tsx:73) independently hardcodes the same labor/trip pair.
// A tenant's custom "Subcontract" would break both, because nothing could say whether it prices
// from a rate or from operator judgment. `pricing_model` and `default_rate_type` are that answer,
// carried as data.
//
// PER-TENANT, one list used across ALL of a tenant's clients (operator decision 2026-08-19).
// A per-client dimension would be a nullable client_id column plus one resolver branch; it is
// deliberately NOT built, and nothing here assumes tenant is the only possible scope.
//
// ★ SCOPE OF THIS SLICE: the definitions only. The enum still governs the four line-item tables —
// nothing reads this table for validation yet, and no behaviour changes. `key` deliberately
// mirrors the enum's values so the migration off the enum is a later, separate step.
//
// ★ FIELDS DELIBERATELY ABSENT: `taxable` and `carries_markup`, which the bank sketches. Neither
// has any ground truth in today's code, so a value here would be invented policy wearing the
// costume of a migration. They land when the operator states the rule.
export const tenantLineItemTypes = pgTable(
  "tenant_line_item_types",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Stable identifier — what a line item stores. NEVER renamed: existing rows point at it.
    key: varchar("key", { length: 64 }).notNull(),
    // Display text — freely editable, and deliberately NOT the identifier. Keeping these two
    // apart is the platform principle's rule (c): display labels and business semantics must not
    // collapse into the same column.
    label: varchar("label", { length: 128 }).notNull(),
    // Whether a line of this type prices ITSELF from an agreed rate (deterministic) or waits for
    // an operator/agent to author a price (judgment). This is the branch that today lives in code.
    pricingModel: lineItemPricingModel("pricing_model").notNull().default("judgment"),
    // The rate_type a deterministic type resolves at (labor → hourly, trip → trip_charge).
    // NULL for every judgment type. Not an FK: rate_type is an enum, not a table.
    defaultRateType: varchar("default_rate_type", { length: 32 }),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One definition per key per tenant. This is what makes `key` safe to store on a line item.
    uniqueIndex("tenant_line_item_types_tenant_key_uq").on(t.tenantId, t.key),
  ],
);
