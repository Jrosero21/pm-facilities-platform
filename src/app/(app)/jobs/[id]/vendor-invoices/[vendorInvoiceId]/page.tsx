import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import {
  getVendorInvoice,
  listVendorInvoiceLineItems,
} from "@/server/billing/vendor-invoices";
import { listPaymentsForVendorInvoice } from "@/server/billing/payments";
import {
  listVendorInvoiceDocuments,
  getVendorInvoiceDocumentUrl,
} from "@/server/billing/vendor-invoice-documents";
import { VendorInvoiceActions } from "@/components/vendor-invoice-actions";
import { VendorInvoiceLineItemsEditor } from "@/components/vendor-invoice-line-items-editor";
import { VendorInvoiceDocuments } from "@/components/vendor-invoice-documents";
import { LinkedPayments } from "@/components/linked-payments";

const STATUS_STYLE: Record<string, string> = {
  received: "bg-neutral-100 text-neutral-700",
  under_review: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  disputed: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export default async function VendorInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; vendorInvoiceId: string }>;
}) {
  const { id, vendorInvoiceId } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const [inv, lines, payments] = await Promise.all([
    getVendorInvoice(tenantId, vendorInvoiceId),
    listVendorInvoiceLineItems(tenantId, vendorInvoiceId),
    listPaymentsForVendorInvoice(tenantId, vendorInvoiceId),
  ]);
  if (!inv || inv.jobId !== id) notFound();

  // Phase (iii) Part 1 — attached documents (list + presigned links). Documents are attachable in ANY
  // state: they arrive on their own schedule (a sign-off often lands AFTER approval) and attaching one
  // changes no money (unlike line-item editing, which stays locked post-approval). The vendor-invoice
  // status enum has no void/cancel state, so the section ALWAYS renders. The Part-3 cost-plus gate needs
  // the invoice document attachable on an APPROVED vendor invoice (the normal case).
  const docs = await listVendorInvoiceDocuments(tenantId, vendorInvoiceId);
  const docsWithUrl = await Promise.all(
    docs.map(async (d) => {
      const served = await getVendorInvoiceDocumentUrl({ tenantId, vendorInvoiceId, attachmentId: d.id });
      return {
        id: d.id,
        title: d.title,
        attachmentType: d.attachmentType,
        sizeBytes: d.fileSizeBytes,
        url: served.kind === "url" ? served.url : null,
      };
    }),
  );

  const header: { label: string; value: string | null }[] = [
    { label: "Invoice #", value: inv.invoiceNumber ?? "—" },
    { label: "Subtotal", value: `$${inv.subtotal}` },
    { label: "Tax", value: `$${inv.taxTotal}` },
    { label: "Total", value: `$${inv.total}` },
    { label: "NTE baseline", value: inv.nteBaselineAmount ? `$${inv.nteBaselineAmount}` : "—" },
    { label: "Payment", value: inv.paymentStatus },
  ];

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job
        </Link>{" "}
        / Vendor invoice
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Vendor invoice</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[inv.status] ?? "bg-neutral-100 text-neutral-700"}`}>
          {inv.status}
        </span>
        {inv.exceedsNte && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">over NTE</span>}
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {header.map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-3">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {/* Line items (read-only; AP — no markup) */}
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
                    <td className="px-3 py-2 text-right">${l.taxAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editable when received/under_review */}
      {(inv.status === "received" || inv.status === "under_review") && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-900">Edit line items</h2>
          <div className="mt-2">
            <VendorInvoiceLineItemsEditor
              vendorInvoiceId={inv.id}
              jobId={id}
              lines={lines.map((l) => ({ id: l.id, lineNumber: l.lineNumber, description: l.description }))}
            />
          </div>
        </div>
      )}

      {/* Attached documents (Phase iii Part 1) — always available (any status; no money impact) */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Attached documents</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Attach the vendor invoice PDF/scan, sign-off, or receipts. Tag the invoice document so cost-plus
          billing can verify it&apos;s on file.
        </p>
        <div className="mt-2">
          <VendorInvoiceDocuments vendorInvoiceId={inv.id} jobId={id} docs={docsWithUrl} />
        </div>
      </div>

      {/* Linked payments */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Payments</h2>
        <LinkedPayments payments={payments} />
      </div>

      {/* Lifecycle actions */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Actions</h2>
        <div className="mt-2">
          <VendorInvoiceActions vendorInvoiceId={inv.id} jobId={id} status={inv.status} />
        </div>
      </div>
    </div>
  );
}
