import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { listClients } from "@/server/clients";

export default async function ClientsPage() {
  const ctx = await requireTenant();
  const clients = await listClients(ctx.activeTenant.tenantId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <Link
          href="/clients/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New client
        </Link>
      </div>

      {clients.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          No clients yet. Create the first one to get started.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{c.clientCode ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
