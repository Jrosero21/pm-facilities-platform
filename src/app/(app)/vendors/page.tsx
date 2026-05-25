import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { listVendors } from "@/server/vendors";

const typeLabel: Record<string, string> = {
  local: "Local",
  regional: "Regional",
  national: "National",
};

export default async function VendorsPage() {
  const ctx = await requireTenant();
  const vendors = await listVendors(ctx.activeTenant.tenantId);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
        <Link
          href="/vendors/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          New vendor
        </Link>
      </div>

      {vendors.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">
          No vendors yet. Create the first one to get started.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/vendors/${v.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {v.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {typeLabel[v.vendorType] ?? v.vendorType}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{v.vendorCode ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
