import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();
  const client = await getClient(ctx.activeTenant.tenantId, id);

  if (!client) notFound();

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/clients" className="hover:text-neutral-900">
          Clients
        </Link>{" "}
        / {client.name}
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{client.name}</h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Client code</dt>
          <dd className="mt-1 text-sm font-medium">{client.clientCode ?? "—"}</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Status</dt>
          <dd className="mt-1 text-sm font-medium">{client.status}</dd>
        </div>
      </dl>

      <p className="mt-8 text-xs text-neutral-500">
        Locations for this client come in Batch 2c.
      </p>
    </div>
  );
}
