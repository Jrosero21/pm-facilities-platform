import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { listActiveTrades } from "@/server/trades";
import { listPrioritiesForTenant } from "@/server/job-reference";
import { listClientLocationsForTenant } from "@/server/client-locations";
import { listClientNteRules } from "@/server/billing/nte";
import { NteRuleForm } from "@/components/nte-rule-form";
import { NteRulesList, type NteRuleListRow } from "@/components/nte-rules-list";

export default async function ClientNteRulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const [client, rules, trades, priorities, allLocations] = await Promise.all([
    getClient(tenantId, id),
    listClientNteRules(tenantId, id),
    listActiveTrades(),
    listPrioritiesForTenant(tenantId),
    listClientLocationsForTenant(tenantId),
  ]);
  if (!client) notFound();

  const locations = allLocations.filter((l) => l.clientId === id);
  const tradeName = new Map(trades.map((t) => [t.id, t.name]));
  const priorityName = new Map(priorities.map((p) => [p.id, p.name]));
  const locationName = new Map(locations.map((l) => [l.id, l.name]));

  const enriched: NteRuleListRow[] = rules.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    tradeId: r.tradeId,
    priorityId: r.priorityId,
    clientLocationId: r.clientLocationId,
    tradeName: tradeName.get(r.tradeId) ?? r.tradeId,
    priorityName: priorityName.get(r.priorityId) ?? r.priorityId,
    locationName: r.clientLocationId ? (locationName.get(r.clientLocationId) ?? r.clientLocationId) : "Client-wide",
    nteAmount: r.nteAmount,
    currency: r.currency,
    status: r.status,
  }));

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/clients/${id}`} className="hover:text-neutral-900">
          {client.name}
        </Link>{" "}
        / NTE rules
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">NTE rules</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Not-to-exceed defaults resolved at job creation (client × trade × priority, optionally per location).
      </p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-900">Rules</h2>
        <div className="mt-3">
          <NteRulesList rules={enriched} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Add a rule</h2>
        <div className="mt-3">
          <NteRuleForm
            clientId={id}
            trades={trades.map((t) => ({ id: t.id, name: t.name }))}
            priorities={priorities.map((p) => ({ id: p.id, name: p.name }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          />
        </div>
      </div>
    </div>
  );
}
