import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { getLocation } from "@/server/client-locations";
import { listLocationContacts } from "@/server/location-contacts";
import { listVendors } from "@/server/vendors";
import { listActiveTrades } from "@/server/trades";
import {
  listLocationBlockedVendors,
  listLocationPreferredVendors,
} from "@/server/dispatch-routing";
import { createLocationContactAction } from "@/app/(app)/clients/contact-actions";
import {
  addBlockedVendorAction,
  addPreferredVendorAction,
  removeBlockedVendorAction,
  removePreferredVendorAction,
} from "@/app/(app)/clients/dispatch-routing-actions";
import { ContactForm } from "@/components/contact-form";
import { ContactList } from "@/components/contact-list";
import { PreferredVendorForm } from "@/components/preferred-vendor-form";
import { BlockedVendorForm } from "@/components/blocked-vendor-form";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string; locationId: string }>;
}) {
  const { id, locationId } = await params;
  const ctx = await requireTenant();

  const client = await getClient(ctx.activeTenant.tenantId, id);
  if (!client) notFound();

  const location = await getLocation(ctx.activeTenant.tenantId, locationId);
  if (!location || location.clientId !== id) notFound();

  const contacts = await listLocationContacts(ctx.activeTenant.tenantId, locationId);
  const addContact = createLocationContactAction.bind(null, id, locationId);

  const [preferred, blocked, vendorRows, tradeRows] = await Promise.all([
    listLocationPreferredVendors(ctx.activeTenant.tenantId, locationId),
    listLocationBlockedVendors(ctx.activeTenant.tenantId, locationId),
    listVendors(ctx.activeTenant.tenantId),
    listActiveTrades(),
  ]);
  const vendorOptions = vendorRows.map((v) => ({ id: v.id, label: v.name }));
  const tradeOptions = tradeRows.map((t) => ({ id: t.id, label: `${t.name} (${t.code})` }));
  const addPreferred = addPreferredVendorAction.bind(null, id, locationId);
  const removePreferred = removePreferredVendorAction.bind(null, id, locationId);
  const addBlocked = addBlockedVendorAction.bind(null, id, locationId);
  const removeBlocked = removeBlockedVendorAction.bind(null, id, locationId);

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
        /{" "}
        <Link href={`/clients/${id}/locations`} className="hover:text-neutral-900">
          Locations
        </Link>{" "}
        / {location.name}
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{location.name}</h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Address</dt>
          <dd className="mt-1 text-sm font-medium">
            {location.addressLine1}
            {location.addressLine2 ? `, ${location.addressLine2}` : ""}, {location.city},{" "}
            {location.stateProvince} {location.postalCode} {location.country}
          </dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Code / Status</dt>
          <dd className="mt-1 text-sm font-medium">
            {location.locationCode ?? "—"} · {location.status}
          </dd>
        </div>
      </dl>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Location contacts</h2>
        <div className="mt-3">
          <ContactList contacts={contacts} />
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-medium text-neutral-800">Add a contact</h3>
          <div className="mt-3">
            <ContactForm action={addContact} />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Preferred vendors</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Ranked per trade — dispatch prefers these first, within the eligibility floor.
        </p>
        <div className="mt-3">
          {preferred.length === 0 ? (
            <p className="text-sm text-neutral-600">No preferred vendors yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Vendor</th>
                    <th className="px-4 py-2 font-medium">Trade</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                    <th className="px-4 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {preferred.map((p) => (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 font-medium text-neutral-900">
                        {p.vendorName}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{p.tradeName}</td>
                      <td className="px-4 py-2 text-neutral-600">{p.priority}</td>
                      <td className="px-4 py-2 text-neutral-600">{p.notes ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <form action={removePreferred}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            type="submit"
                            className="text-sm text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-medium text-neutral-800">Add a preferred vendor</h3>
          <div className="mt-3">
            <PreferredVendorForm
              action={addPreferred}
              vendors={vendorOptions}
              trades={tradeOptions}
            />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Blocked vendors</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Barred from this location for any trade — excluded from dispatch before
          preference is even considered.
        </p>
        <div className="mt-3">
          {blocked.length === 0 ? (
            <p className="text-sm text-neutral-600">No blocked vendors.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Vendor</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium">Blocked by</th>
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {blocked.map((b) => (
                    <tr key={b.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-2 font-medium text-neutral-900">
                        {b.vendorName}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{b.reason ?? "—"}</td>
                      <td className="px-4 py-2 text-neutral-600">
                        {b.blockedByName ?? b.blockedByEmail ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-neutral-600">
                        {b.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <form action={removeBlocked}>
                          <input type="hidden" name="id" value={b.id} />
                          <button
                            type="submit"
                            className="text-sm text-red-600 hover:text-red-700"
                          >
                            Unblock
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-medium text-neutral-800">Block a vendor</h3>
          <div className="mt-3">
            <BlockedVendorForm action={addBlocked} vendors={vendorOptions} />
          </div>
        </div>
      </div>
    </div>
  );
}
