import {
  numeric,
  integer,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { lineItemCategory } from "./enums";
import { v7 as uuidv7 } from "uuid";

// Re-export the line-item category values for consumers (proposal/invoice agents use it
// for Zod validation and the ProposalLineCategory union). Derived from the pgEnum so the
// values stay single-sourced in ./enums (batch 2: was a standalone `as const` array).
export const lineItemCategoryEnum = lineItemCategory.enumValues;

// ── Phase 8 batch 8b — SHARED LINE-ITEM COLUMN SHAPE (8b-D4) ─────────────────────────
// The four line-item tables (proposal/change_order/vendor_invoice/client_invoice) share an
// identical BASE shape; the three AR-side tables additionally carry markup columns. Vendor
// (AP) line items carry NO markup (#6). 8a #4 said "identical shape"; this is the refined
// "shared base + AR extension" (recorded in 02-decisions at closeout).
//
// These are FACTORY functions (not shared object literals) on purpose: Drizzle column
// builders are stateful and bind to the first table they're spread into, so reusing the
// same instances across tables corrupts the second table. Each call returns fresh builders.
//
// The PARENT FK + tenant FK are NOT here — they are added per-table in each table's config
// callback with explicit short FK names (the invoice line-item parent FKs would otherwise
// exceed MySQL's 64-char limit; R-6.22).



// Base shape — spread into ALL four line-item tables. Money is numeric(12,2) (OQ-1);
// quantity numeric(10,2) (fractional hours/units); tax placeholders (OQ-7). extended_amount
// is writer-owned (recalculate*Totals); the default 0 is just an insert safety net.
export const baseLineItemColumns = () => ({
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull(),
  lineNumber: integer("line_number").notNull(),
  category: lineItemCategory("category").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: varchar("unit", { length: 32 }),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  extendedAmount: numeric("extended_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  taxRate: numeric("tax_rate", { precision: 6, scale: 3 }),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// AR-only markup columns — spread into proposal/change_order/client_invoice line items.
// NOT on vendor_invoice_line_items (#6). markup_amount writer-owned (recalculate*Totals).
export const arMarkupColumns = () => ({
  markupPercent: numeric("markup_percent", { precision: 6, scale: 3 }),
  markupAmount: numeric("markup_amount", { precision: 12, scale: 2 }).notNull().default("0"),
});
