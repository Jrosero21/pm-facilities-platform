import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { listClientInvoicesForJob } from "@/server/billing/client-invoices";
import { listVendorInvoicesForJob } from "@/server/billing/vendor-invoices";
import { PaymentForm } from "@/components/payment-form";

export default async function NewPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;
  const [job, clientInvs, vendorInvs] = await Promise.all([
    getJobDetail(tenantId, id),
    listClientInvoicesForJob(tenantId, id),
    listVendorInvoicesForJob(tenantId, id),
  ]);
  if (!job) notFound();

  const clientOptions = clientInvs
    .filter((ci) => ci.status === "sent")
    .map((ci) => ({ id: ci.id, label: `${ci.invoiceNumber ?? "(no number)"} · $${ci.total} · ${ci.paymentStatus}` }));
  const vendorOptions = vendorInvs
    .filter((vi) => vi.status === "approved")
    .map((vi) => ({ id: vi.id, label: `${vi.invoiceNumber ?? "(no number)"} · $${vi.total} · ${vi.paymentStatus}` }));

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job #{job.jobNumber}
        </Link>{" "}
        / Record payment
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Record payment</h1>
      <div className="mt-6">
        <PaymentForm jobId={id} clientInvoices={clientOptions} vendorInvoices={vendorOptions} />
      </div>
    </div>
  );
}
