import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { listLocations } from "@/server/client-locations";

export default async function ClientLocationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();

  const client = await getClient(ctx.activeTenant.tenantId, id);
  if (!client) notFound();

  const locations = await listLocations(ctx.activeTenant.tenantId, id);

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/clients" className="hover:text-neutral-900">
          Clients
        </Link>{" "}
        /{" "}
        <Link href={`/clients/${id}`} className="hover:text-neutral-900">
          {client.name}
        </Link>{" "}
        / Locations
      </div>

      <div className="mt-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{client.name} — Locations</h1>
        <Link
          href={`/clients/${id}/locations/new`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New location
        </Link>
      </div>

      {locations.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">No locations yet for this client.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {locations.map((loc) => (
                <tr key={loc.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium text-neutral-900">{loc.name}</td>
                  <td className="px-4 py-2 text-neutral-600">{loc.locationCode ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {loc.addressLine1}, {loc.city}, {loc.stateProvince} {loc.postalCode}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{loc.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
