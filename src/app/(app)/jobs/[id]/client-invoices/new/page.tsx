import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJob } from "@/server/jobs";
import { ClientInvoiceForm } from "@/components/client-invoice-form";

export default async function NewClientInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const job = await getJob(ctx.activeTenant.tenantId, id);
  if (!job) notFound();

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job #{job.jobNumber}
        </Link>{" "}
        / New client invoice
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New client invoice</h1>
      <div className="mt-6">
        <ClientInvoiceForm jobId={id} clientId={job.clientId} />
      </div>
    </div>
  );
}
