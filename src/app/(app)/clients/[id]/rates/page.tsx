import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { listActiveTrades } from "@/server/trades";
import { listClientRates } from "@/server/billing/client-rates";
import { ClientRateForm } from "@/components/client-rate-form";
import { ClientRatesList, type ClientRateListRow } from "@/components/client-rates-list";

export default async function ClientRatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const [client, rates, trades] = await Promise.all([
    getClient(tenantId, id),
    listClientRates(tenantId, id),
    listActiveTrades(),
  ]);
  if (!client) notFound();

  const listRows: ClientRateListRow[] = rates.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    tradeName: r.tradeName,
    rateType: r.rateType,
    amount: r.amount,
    currency: r.currency,
    unit: r.unit,
    effectiveDate: r.effectiveDate,
    expiryDate: r.expiryDate,
    status: r.status,
  }));

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/clients/${id}`} className="hover:text-neutral-900">
          {client.name}
        </Link>{" "}
        / Rate sheet
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rate sheet</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Agreed billed rates per trade (e.g. HVAC $95/hr). Used to bill the client when their billing model is rate-sheet.
      </p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-900">Rates</h2>
        <div className="mt-3">
          <ClientRatesList rates={listRows} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Add a rate</h2>
        <div className="mt-3">
          <ClientRateForm clientId={id} trades={trades.map((t) => ({ id: t.id, name: t.name }))} />
        </div>
      </div>
    </div>
  );
}
