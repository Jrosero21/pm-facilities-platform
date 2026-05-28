import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { ChangeOrderForm } from "@/components/change-order-form";

export default async function NewChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const job = await getJobDetail(ctx.activeTenant.tenantId, id);
  if (!job) notFound();

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job #{job.jobNumber}
        </Link>{" "}
        / New change order
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New change order</h1>
      <div className="mt-6">
        <ChangeOrderForm jobId={id} />
      </div>
    </div>
  );
}
