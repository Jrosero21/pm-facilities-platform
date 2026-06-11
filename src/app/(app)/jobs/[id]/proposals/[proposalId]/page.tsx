import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getProposal, listProposalLineItems } from "@/server/billing/proposals";
import { loadLaborRatePickerContext } from "@/server/billing/client-rates";
import { ProposalActions } from "@/components/proposal-actions";
import { ProposalLineItemsEditor } from "@/components/proposal-line-items-editor";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  sent: "bg-blue-100 text-blue-700",
  viewed: "bg-indigo-100 text-indigo-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-700",
  withdrawn: "bg-neutral-100 text-neutral-500",
  expired: "bg-amber-100 text-amber-700",
  superseded: "bg-neutral-100 text-neutral-500",
  internal_billed: "bg-teal-100 text-teal-700", // Phase 27 — terminal internal proposal
};

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const { id, proposalId } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const [proposal, lines, rateContext] = await Promise.all([
    getProposal(tenantId, proposalId),
    listProposalLineItems(tenantId, proposalId),
    loadLaborRatePickerContext({ tenantId, jobId: id }),
  ]);
  if (!proposal || proposal.jobId !== id) notFound();

  const header: { label: string; value: string | null }[] = [
    { label: "Subtotal", value: `$${proposal.subtotal}` },
    { label: "Markup", value: `$${proposal.markupTotal}` },
    { label: "Tax", value: `$${proposal.taxTotal}` },
    { label: "Total", value: `$${proposal.total}` },
    { label: "Currency", value: proposal.currency },
    { label: "Valid until", value: proposal.validUntil ? proposal.validUntil.toLocaleDateString() : null },
  ];

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job
        </Link>{" "}
        / Proposal
      </div>
      <div className="mt-1 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {proposal.title ?? "Untitled proposal"}
          {proposal.revisionNumber > 1 && (
            <span className="ml-2 text-base font-normal text-neutral-500">rev {proposal.revisionNumber}</span>
          )}
        </h1>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[proposal.status] ?? "bg-neutral-100 text-neutral-700"}`}>
          {proposal.status}
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

      {proposal.scopeSnapshot && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Scope snapshot</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{proposal.scopeSnapshot}</dd>
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
      {proposal.status === "draft" && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-900">Edit line items</h2>
          <div className="mt-2">
            <ProposalLineItemsEditor
              proposalId={proposal.id}
              jobId={id}
              lines={lines.map((l) => ({ id: l.id, lineNumber: l.lineNumber, description: l.description }))}
              rateContext={rateContext}
            />
          </div>
        </div>
      )}

      {/* Lifecycle actions */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Actions</h2>
        <div className="mt-2">
          <ProposalActions proposalId={proposal.id} jobId={id} status={proposal.status} />
        </div>
      </div>
    </div>
  );
}
