import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { listAssignmentsForJob } from "@/server/dispatch";
import { VendorInvoiceForm } from "@/components/vendor-invoice-form";

export default async function NewVendorInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const [job, assignments] = await Promise.all([getJobDetail(tenantId, id), listAssignmentsForJob(tenantId, id)]);
  if (!job) notFound();

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job #{job.jobNumber}
        </Link>{" "}
        / Record vendor invoice
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Record vendor invoice</h1>
      <div className="mt-6">
        <VendorInvoiceForm
          jobId={id}
          assignments={assignments.map((a) => ({ id: a.id, vendorId: a.vendorId, vendorName: a.vendorName, statusName: a.statusName }))}
        />
      </div>
    </div>
  );
}
