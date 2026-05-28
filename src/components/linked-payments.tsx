import type { PaymentRow } from "@/server/billing/payments";

// ── Phase 8 batch 8c.11d — linked-payments section (read-only, contextual) ────────────
// Shown on an invoice detail: "how has this invoice been paid?" Uses the existing 8c.9 readers
// (listPaymentsForVendorInvoice / listPaymentsForClientInvoice); no new data-layer. The broader
// payment-management view is the 8c.11e payments page.

export function LinkedPayments({ payments }: { payments: PaymentRow[] }) {
  if (payments.length === 0) {
    return <p className="mt-2 text-sm text-neutral-600">No payments recorded.</p>;
  }
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-3 py-2">Direction</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2">Reference</th>
            <th className="px-3 py-2">Paid</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-neutral-50 last:border-0">
              <td className="px-3 py-2">{p.direction}</td>
              <td className="px-3 py-2 text-right font-medium">${p.amount}</td>
              <td className="px-3 py-2">{p.method ?? "—"}</td>
              <td className="px-3 py-2">{p.reference ?? "—"}</td>
              <td className="px-3 py-2">{p.paidAt.toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
