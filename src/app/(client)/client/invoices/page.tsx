import Link from "next/link";
import { requireClient } from "@/server/auth-context";
import { listClientInvoicesForClientScope } from "@/server/client/list-client-invoices";

/**
 * Client invoices — Phase 11 batch 11i (read-only, list-only, OQ-6-safe).
 *
 * Issued (status='sent') invoices across the client's in-scope jobs. Renders the
 * marked-up TOTAL only — never markup/subtotal/line items (OQ-6). No detail route
 * (list-only). Activates the 11d Invoices nav link (was 404).
 */
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
};

function money(total: string, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(total));
  } catch {
    return `${total} ${currency}`;
  }
}

export default async function ClientInvoicesPage() {
  const ctx = await requireClient();
  const invoices = await listClientInvoicesForClientScope(
    ctx.activeTenant.tenantId,
    ctx.clientScope,
  );

  return (
    <section className="max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
      </header>

      {invoices.length === 0 ? (
        <p className="text-sm text-neutral-500">No invoices yet.</p>
      ) : (
        <ul className="space-y-3">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium text-neutral-900">
                  {inv.invoiceNumber ?? "Invoice"}
                </p>
                <p className="text-xs text-neutral-500">
                  <Link
                    href={`/client/jobs/${inv.jobId}`}
                    className="underline underline-offset-2 hover:text-neutral-900"
                  >
                    Job #{inv.jobNumber}
                  </Link>
                  {inv.issuedAt
                    ? ` · Issued ${new Date(inv.issuedAt).toLocaleDateString()}`
                    : ""}
                  {inv.dueAt
                    ? ` · Due ${new Date(inv.dueAt).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-neutral-900">
                  {money(inv.total, inv.currency)}
                </p>
                <p className="text-xs text-neutral-500">
                  {PAYMENT_LABEL[inv.paymentStatus] ?? inv.paymentStatus}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
