import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { listClients } from "@/server/clients";
import { listClientLocationsForTenant } from "@/server/client-locations";
import { listActiveTrades } from "@/server/trades";
import { listPrioritiesForTenant } from "@/server/job-reference";
import { JobForm } from "@/components/job-form";

export default async function NewJobPage() {
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const [clients, locations, trades, priorities] = await Promise.all([
    listClients(tenantId),
    listClientLocationsForTenant(tenantId),
    listActiveTrades(),
    listPrioritiesForTenant(tenantId),
  ]);

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/jobs" className="hover:text-neutral-900">
          Jobs
        </Link>{" "}
        / New
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New job</h1>
      <div className="mt-6">
        <JobForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          locations={locations}
          trades={trades.map((t) => ({ id: t.id, name: t.name }))}
          priorities={priorities.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    </div>
  );
}
