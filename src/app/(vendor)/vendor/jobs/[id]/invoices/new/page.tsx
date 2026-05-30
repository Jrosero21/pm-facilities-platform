import { notFound } from "next/navigation";
import Link from "next/link";
import { requireVendor } from "@/server/auth-context";
import { getVendorAssignmentDetail } from "@/server/vendor/get-vendor-assignment-detail";
import { VendorInvoiceForm } from "@/components/vendor/vendor-invoice-form";

/**
 * Vendor submits an invoice for the given assignment.
 *
 * Per DoR-10n.1: assignment-scoped route (data-flow rationale). Roadmap §8's
 * literal /vendor/invoices/new is documented as a deviation — jobId + vendorId
 * resolve naturally from the assignment here instead of via an assignment picker.
 *
 * Phase 10 batch 10n-construct.
 */
export default async function VendorInvoiceNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireVendor();
  const detail = await getVendorAssignmentDetail(
    ctx.activeTenant.tenantId,
    id,
    ctx.vendorScope,
  );
  if (!detail) notFound();

  return (
    <section className="space-y-6">
      <header>
        <Link
          href={`/vendor/jobs/${id}`}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          ← Back to assignment
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Submit invoice
        </h1>
        <p className="mt-1 text-sm text-neutral-700">
          {detail.vendorName} · #{detail.jobNumber}
        </p>
      </header>
      <VendorInvoiceForm assignmentId={id} />
    </section>
  );
}
