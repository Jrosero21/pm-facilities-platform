import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail } from "@/server/jobs";
import { ProposalForm } from "@/components/proposal-form";

export default async function NewProposalPage({ params }: { params: Promise<{ id: string }> }) {
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
        / New proposal
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New proposal</h1>
      <div className="mt-6">
        <ProposalForm jobId={id} />
      </div>
    </div>
  );
}
