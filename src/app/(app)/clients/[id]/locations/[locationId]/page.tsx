import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { getLocation } from "@/server/client-locations";
import { listLocationContacts } from "@/server/location-contacts";
import { createLocationContactAction } from "@/app/(app)/clients/contact-actions";
import { ContactForm } from "@/components/contact-form";
import { ContactList } from "@/components/contact-list";

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
    </div>
  );
}
