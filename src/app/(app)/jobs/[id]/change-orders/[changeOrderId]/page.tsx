import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getChangeOrder, getEffectiveNte, listChangeOrderLineItems } from "@/server/billing/change-orders";
import { ChangeOrderActions } from "@/components/change-order-actions";
import { ChangeOrderLineItemsEditor } from "@/components/change-order-line-items-editor";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  withdrawn: "bg-neutral-100 text-neutral-500",
};

export default async function ChangeOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; changeOrderId: string }>;
}) {
  const { id, changeOrderId } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const [co, lines, effectiveNte] = await Promise.all([
    getChangeOrder(tenantId, changeOrderId),
    listChangeOrderLineItems(tenantId, changeOrderId),
    getEffectiveNte(tenantId, id),
  ]);
  if (!co || co.jobId !== id) notFound();

  const header: { label: string; value: string | null }[] = [
    { label: "Subtotal", value: `$${co.subtotal}` },
    { label: "Markup", value: `$${co.markupTotal}` },
    { label: "Tax", value: `$${co.taxTotal}` },
    { label: "Total", value: `$${co.total}` },
    { label: "Currency", value: co.currency },
  ];

  // Effective-NTE context (read-only; getEffectiveNte already includes APPROVED COs).
  let nteNote: string;
  if (effectiveNte === null) {
    nteNote = "This job has no NTE ceiling.";
  } else if (co.status === "approved") {
    nteNote = `Included in the job's current effective NTE of $${effectiveNte}.`;
  } else if (co.status === "draft" || co.status === "submitted") {
    nteNote = `Current job effective NTE is $${effectiveNte}; approving this change order adds $${co.total}.`;
  } else {
    nteNote = `Not applied — the job's effective NTE is $${effectiveNte}.`;
  }

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job
        </Link>{" "}
        / Change order
      </div>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Change order</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[co.status] ?? "bg-neutral-100 text-neutral-700"}`}>
          {co.status}
        </span>
      </div>

      {co.reason && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Reason</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{co.reason}</dd>
        </div>
      )}

      <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {header.map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-3">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-sm text-neutral-600">{nteNote}</p>

      {co.scopeDeltaSnapshot && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Scope delta</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{co.scopeDeltaSnapshot}</dd>
        </div>
      )}

      {/* Line items (read-only view) */}
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

      {/* Draft-only line editing */}
      {co.status === "draft" && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-900">Edit line items</h2>
          <div className="mt-2">
            <ChangeOrderLineItemsEditor
              changeOrderId={co.id}
              jobId={id}
              lines={lines.map((l) => ({ id: l.id, lineNumber: l.lineNumber, description: l.description }))}
            />
          </div>
        </div>
      )}

      {/* Lifecycle actions */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Actions</h2>
        <div className="mt-2">
          <ChangeOrderActions changeOrderId={co.id} jobId={id} status={co.status} />
        </div>
      </div>
    </div>
  );
}
