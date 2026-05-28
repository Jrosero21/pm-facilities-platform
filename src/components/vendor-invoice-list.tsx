import Link from "next/link";
import type { VendorInvoiceRow } from "@/server/billing/vendor-invoices";

// ── Phase 8 batch 8c.11d — compact vendor-invoice (AP) list on the job detail ─────────

const STATUS_STYLE: Record<string, string> = {
  received: "bg-neutral-100 text-neutral-700",
  under_review: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  disputed: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-700",
};
const PAY_STYLE: Record<string, string> = {
  unpaid: "bg-neutral-100 text-neutral-500",
  partially_paid: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export function VendorInvoiceList({ vendorInvoices, jobId }: { vendorInvoices: VendorInvoiceRow[]; jobId: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-neutral-500">{vendorInvoices.length} total</span>
        <Link href={`/jobs/${jobId}/vendor-invoices/new`} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          Record invoice
        </Link>
      </div>
      {vendorInvoices.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">No vendor invoices yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {vendorInvoices.map((vi) => (
            <li key={vi.id}>
              <Link href={`/jobs/${jobId}/vendor-invoices/${vi.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">{vi.invoiceNumber ?? "(no number)"}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{vi.createdAt.toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">${vi.total}</span>
                  {vi.exceedsNte && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">over NTE</span>}
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${PAY_STYLE[vi.paymentStatus] ?? ""}`}>{vi.paymentStatus}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[vi.status] ?? "bg-neutral-100 text-neutral-700"}`}>{vi.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
