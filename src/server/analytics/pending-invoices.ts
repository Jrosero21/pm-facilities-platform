import "server-only";

// ── Phase 9 batch 9c — PENDING-INVOICE COUNTS (dashboard AR/AP cards) ─────────────────
// Tenant-wide pending-invoice counts (9c manifest §3/§4). Two scalar COUNT queries (one per
// table); the two-query form is clearer than a UNION and indexed-equivalent at this volume
// (both tables carry a `(tenant_id, status)` index). Counts coerced via Number() (mirrors the
// billing close.ts count pattern). Empty → {0,0,0}; never throws.

import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { clientInvoices, vendorInvoices } from "@/server/schema";

/**
 * Pending invoice counts for the dashboard.
 * STRICT-AP: `approved` vendor invoices not yet fully paid — pre-approval (`received`,
 * `under_review`) and `disputed`/`paid` excluded; matches the Phase 8 AP reader semantics (single
 * AP universe). AR: issued (`sent`) client invoices not yet fully paid — `draft`/`void` excluded.
 * `payment_status <> 'paid'` == `inArray(['unpaid','partially_paid'])` (the enum is 3-valued); this
 * mirrors close.ts's unpaid-invoice predicates exactly.
 */
export async function countPendingInvoices(
  tenantId: string,
): Promise<{ vendorPending: number; clientPending: number; total: number }> {
  const vendorPending = Number(
    (
      await db
        .select({ c: count() })
        .from(vendorInvoices)
        .where(
          and(
            eq(vendorInvoices.tenantId, tenantId),
            eq(vendorInvoices.status, "approved"),
            inArray(vendorInvoices.paymentStatus, ["unpaid", "partially_paid"]),
          ),
        )
    )[0]?.c ?? 0,
  );

  const clientPending = Number(
    (
      await db
        .select({ c: count() })
        .from(clientInvoices)
        .where(
          and(
            eq(clientInvoices.tenantId, tenantId),
            eq(clientInvoices.status, "sent"),
            inArray(clientInvoices.paymentStatus, ["unpaid", "partially_paid"]),
          ),
        )
    )[0]?.c ?? 0,
  );

  return { vendorPending, clientPending, total: vendorPending + clientPending };
}
