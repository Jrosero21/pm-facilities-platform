import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import {
  getClientInvoice,
  listClientInvoiceLineItems,
  resolveClientMarkupDefault,
} from "@/server/billing/client-invoices";
import { loadLaborRatePickerContext } from "@/server/billing/client-rates";
import { shouldWarnMissingVendorDoc } from "@/server/billing/cost-plus-doc-gate";
import { listPaymentsForClientInvoice } from "@/server/billing/payments";
import { isAccountingRole } from "@/server/billing/role-gates";
import { ClientInvoiceActions } from "@/components/client-invoice-actions";
import { ClientInvoiceLineItemsEditor } from "@/components/client-invoice-line-items-editor";
import { LinkedPayments } from "@/components/linked-payments";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-blue-100 text-blue-700",
  void: "bg-neutral-100 text-neutral-500",
};

export default async function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; clientInvoiceId: string }>;
}) {
  const { id, clientInvoiceId } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const canAccount = isAccountingRole(ctx.roleKeys, ctx.isSuperAdmin);

  const inv = await getClientInvoice(tenantId, clientInvoiceId);
  if (!inv || inv.jobId !== id) notFound();

  const [lines, payments, defaultMarkup, rateContext] = await Promise.all([
    listClientInvoiceLineItems(tenantId, clientInvoiceId),
    listPaymentsForClientInvoice(tenantId, clientInvoiceId),
    resolveClientMarkupDefault(tenantId, inv.clientId),
    loadLaborRatePickerContext({ tenantId, jobId: id }),
  ]);

  // Phase (iii) Part 3 — pre-compute the cost-plus "vendor invoice on file" advisory for the Send button
  // (only a draft can be issued). The action re-verifies server-side; this just surfaces it before click.
  const needsVendorDocAck = inv.status === "draft" ? await shouldWarnMissingVendorDoc(tenantId, inv) : false;

  const header: { label: string; value: string | null }[] = [
    { label: "Invoice #", value: inv.invoiceNumber ?? "—" },
    { label: "Subtotal", value: `$${inv.subtotal}` },
    { label: "Markup", value: `$${inv.markupTotal}` },
    { label: "Tax", value: `$${inv.taxTotal}` },
    { label: "Total", value: `$${inv.total}` },
    { label: "Payment", value: inv.paymentStatus },
  ];

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job
        </Link>{" "}
        / Client invoice
      </div>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Client invoice</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[inv.status] ?? "bg-neutral-100 text-neutral-700"}`}>
          {inv.status}
        </span>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {header.map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-3">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {/* Line items (read-only; AR — markup shown) */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Line items</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600">No line items.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Extended</th>
                  <th className="px-3 py-2 text-right">Markup %</th>
                  <th className="px-3 py-2 text-right">Markup</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-50 last:border-0">
                    <td className="px-3 py-2 text-neutral-500">{l.lineNumber}</td>
                    <td className="px-3 py-2">{l.category}</td>
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right">{l.quantity}</td>
                    <td className="px-3 py-2 text-right">${l.unitPrice}</td>
                    <td className="px-3 py-2 text-right">${l.extendedAmount}</td>
                    <td className="px-3 py-2 text-right">{l.markupPercent ?? "—"}</td>
                    <td className="px-3 py-2 text-right">${l.markupAmount}</td>
                    <td className="px-3 py-2 text-right">${l.taxAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editable when draft */}
      {inv.status === "draft" && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-900">Edit line items</h2>
          <div className="mt-2">
            <ClientInvoiceLineItemsEditor
              clientInvoiceId={inv.id}
              jobId={id}
              defaultMarkup={defaultMarkup}
              lines={lines.map((l) => ({ id: l.id, lineNumber: l.lineNumber, description: l.description }))}
              rateContext={rateContext}
            />
          </div>
        </div>
      )}

      {/* Linked payments */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Payments</h2>
        <LinkedPayments payments={payments} />
      </div>

      {/* Lifecycle actions (accounting-gated send/void) */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Actions</h2>
        <div className="mt-2">
          <ClientInvoiceActions clientInvoiceId={inv.id} jobId={id} status={inv.status} canAccount={canAccount} needsVendorDocAck={needsVendorDocAck} />
        </div>
      </div>
    </div>
  );
}
