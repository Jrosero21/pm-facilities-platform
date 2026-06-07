import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getJobDetail, hasActiveAssignment } from "@/server/jobs";
import { listClients } from "@/server/clients";
import { listClientLocationsForTenant } from "@/server/client-locations";
import { listActiveTrades } from "@/server/trades";
import { listPrioritiesForTenant } from "@/server/job-reference";
import { JobEditForm } from "@/components/job-edit-form";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const job = await getJobDetail(tenantId, id);
  if (!job) notFound();

  const [clients, locations, trades, priorities, activeAssignment] = await Promise.all([
    listClients(tenantId),
    listClientLocationsForTenant(tenantId),
    listActiveTrades(),
    listPrioritiesForTenant(tenantId),
    hasActiveAssignment(tenantId, id),
  ]);

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/jobs/${id}`} className="hover:text-neutral-900">
          Job #{job.jobNumber}
        </Link>{" "}
        / Edit
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Edit job #{job.jobNumber}</h1>
      <div className="mt-6">
        <JobEditForm
          jobId={id}
          sourceType={job.sourceType}
          current={{
            clientId: job.clientId,
            clientLocationId: job.clientLocationId,
            primaryTradeId: job.primaryTradeId,
            priorityId: job.priorityId,
            notToExceedAmount: job.notToExceedAmount,
            problemDescription: job.problemDescription,
            scopeOfWork: job.scopeOfWork,
          }}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          locations={locations}
          trades={trades.map((t) => ({ id: t.id, name: t.name }))}
          priorities={priorities.map((p) => ({ id: p.id, name: p.name }))}
          hasActiveAssignment={activeAssignment}
        />
      </div>
    </div>
  );
}
