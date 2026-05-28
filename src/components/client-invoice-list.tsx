import Link from "next/link";
import type { ClientInvoiceRow } from "@/server/billing/client-invoices";

// ── Phase 8 batch 8c.11d — compact client-invoice (AR) list on the job detail ─────────

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-blue-100 text-blue-700",
  void: "bg-neutral-100 text-neutral-500",
};
const PAY_STYLE: Record<string, string> = {
  unpaid: "bg-neutral-100 text-neutral-500",
  partially_paid: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export function ClientInvoiceList({ clientInvoices, jobId }: { clientInvoices: ClientInvoiceRow[]; jobId: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-500">{clientInvoices.length} total</span>
        <Link href={`/jobs/${jobId}/client-invoices/new`} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          New invoice
        </Link>
      </div>
      {clientInvoices.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">No client invoices yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {clientInvoices.map((ci) => (
            <li key={ci.id}>
              <Link href={`/jobs/${jobId}/client-invoices/${ci.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{ci.invoiceNumber ?? "(draft)"}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{ci.createdAt.toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">${ci.total}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${PAY_STYLE[ci.paymentStatus] ?? ""}`}>{ci.paymentStatus}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[ci.status] ?? "bg-neutral-100 text-neutral-700"}`}>{ci.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
