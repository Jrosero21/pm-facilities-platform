import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { listLocations } from "@/server/client-locations";
import { listClientContacts } from "@/server/client-contacts";
import { createClientContactAction } from "@/app/(app)/clients/contact-actions";
import { ContactForm } from "@/components/contact-form";
import { ContactList } from "@/components/contact-list";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();
  const client = await getClient(ctx.activeTenant.tenantId, id);

  if (!client) notFound();

  const locations = await listLocations(ctx.activeTenant.tenantId, id);
  const contacts = await listClientContacts(ctx.activeTenant.tenantId, id);
  const addContact = createClientContactAction.bind(null, id);

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/clients" className="hover:text-neutral-900">
          Clients
        </Link>{" "}
        / {client.name}
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{client.name}</h1>
      <div className="mt-2">
        <Link href={`/clients/${id}/nte-rules`} className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
          Billing NTE rules →
        </Link>
      </div>

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

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Locations</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              {locations.length} active {locations.length === 1 ? "location" : "locations"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href={`/clients/${id}/locations`} className="text-neutral-600 hover:text-neutral-900">
              Manage
            </Link>
            <Link
              href={`/clients/${id}/locations/new`}
              className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-800"
            >
              Add location
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900">Contacts</h2>
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
