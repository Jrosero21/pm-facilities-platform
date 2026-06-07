import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { listClientBillingRules } from "@/server/billing/billing-rules";
import { BillingRuleForm } from "@/components/billing-rule-form";
import { BillingRulesList, type BillingRuleListRow } from "@/components/billing-rules-list";

export default async function ClientBillingRulesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const tenantId = ctx.activeTenant.tenantId;

  const [client, rules] = await Promise.all([getClient(tenantId, id), listClientBillingRules(tenantId, id)]);
  if (!client) notFound();

  const listRows: BillingRuleListRow[] = rules.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    name: r.name,
    markupPercent: r.markupPercent,
    paymentTermsDays: r.paymentTermsDays,
    isDefault: r.isDefault,
    status: r.status,
  }));

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href={`/clients/${id}`} className="hover:text-neutral-900">
          {client.name}
        </Link>{" "}
        / Markup &amp; billing rules
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Markup &amp; billing rules</h1>
      <p className="mt-1 text-sm text-neutral-600">
        The client&apos;s default markup is applied to proposal and invoice lines (cost-plus billing). One rule is the default.
      </p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-900">Rules</h2>
        <div className="mt-3">
          <BillingRulesList rules={listRows} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Add a rule</h2>
        <div className="mt-3">
          <BillingRuleForm clientId={id} />
        </div>
      </div>
    </div>
  );
}
