import type { ProposalRow } from "@/server/billing/proposals";
import type { ChangeOrderRow } from "@/server/billing/change-orders";
import type { VendorInvoiceRow } from "@/server/billing/vendor-invoices";
import type { ClientInvoiceRow } from "@/server/billing/client-invoices";
import type { PaymentRow } from "@/server/billing/payments";

// ── Phase 8 batch 8c.11a — read-only billing summary (server component) ────────────────
// The financial overview block on the job detail page: margin, the soft close-readiness
// advisory, and per-type record counts. READ-ONLY — the record-detail screens, create/edit
// forms, and action buttons are 8c.11b–e. Matches the existing job-detail card idiom.

type JobMargin = { revenue: string; cost: string; margin: string };
type CloseReadiness = { ready: boolean; concerns: { type: string; count: number }[] };

const CONCERN_LABELS: Record<string, string> = {
  unpaid_approved_vendor_invoices: "Unpaid approved vendor invoices",
  unpaid_sent_client_invoices: "Unpaid sent client invoices",
  unresolved_vendor_invoices: "Unresolved vendor invoices",
  disputed_vendor_invoices: "Disputed vendor invoices",
  draft_client_invoices: "Draft client invoices",
  open_proposals: "Open proposals",
  open_change_orders: "Open change orders",
};

// Format a decimal string as currency; negatives render as -$X (not $-X).
function money(s: string): string {
  return s.startsWith("-") ? `-$${s.slice(1)}` : `$${s}`;
}

export function BillingSection(props: {
  margin: JobMargin;
  readiness: CloseReadiness;
  proposals: ProposalRow[];
  changeOrders: ChangeOrderRow[];
  vendorInvoices: VendorInvoiceRow[];
  clientInvoices: ClientInvoiceRow[];
  payments: PaymentRow[];
}) {
  const { margin, readiness } = props;
  const counts: { label: string; n: number }[] = [
    { label: "Proposals", n: props.proposals.length },
    { label: "Change orders", n: props.changeOrders.length },
    { label: "Vendor invoices", n: props.vendorInvoices.length },
    { label: "Client invoices", n: props.clientInvoices.length },
    { label: "Payments", n: props.payments.length },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Margin */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <dt className="text-xs uppercase tracking-wide text-neutral-500">Margin</dt>
        <dd className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-500">Revenue (AR)</span>
            <span className="font-medium text-neutral-900">{money(margin.revenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Cost (AP)</span>
            <span className="font-medium text-neutral-900">{money(margin.cost)}</span>
          </div>
          <div className="flex justify-between border-t border-neutral-100 pt-1">
            <span className="text-neutral-500">Margin</span>
            <span
              className={`font-semibold ${
                margin.margin.startsWith("-") ? "text-red-600" : "text-emerald-700"
              }`}
            >
              {money(margin.margin)}
            </span>
          </div>
        </dd>
      </div>

      {/* Close readiness (soft advisory) */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <dt className="text-xs uppercase tracking-wide text-neutral-500">Close readiness</dt>
        <dd className="mt-2 text-sm">
          {readiness.ready ? (
            <p className="font-medium text-emerald-700">Ready to close — no outstanding concerns.</p>
          ) : (
            <>
              <p className="text-neutral-600">Advisory — review before closing billing:</p>
              <ul className="mt-1 space-y-1">
                {readiness.concerns.map((c) => (
                  <li key={c.type} className="flex justify-between gap-2">
                    <span className="text-neutral-700">{CONCERN_LABELS[c.type] ?? c.type}</span>
                    <span className="font-medium text-amber-700">{c.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </dd>
      </div>

      {/* Record counts */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <dt className="text-xs uppercase tracking-wide text-neutral-500">Records</dt>
        <dd className="mt-2 space-y-1 text-sm">
          {counts.map((c) => (
            <div key={c.label} className="flex justify-between">
              <span className="text-neutral-500">{c.label}</span>
              <span className="font-medium text-neutral-900">{c.n}</span>
            </div>
          ))}
        </dd>
      </div>
    </div>
  );
}
