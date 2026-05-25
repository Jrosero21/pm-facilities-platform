import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getClient } from "@/server/clients";
import { LocationForm } from "@/components/location-form";
import { createLocationAction } from "@/app/(app)/clients/location-actions";

export default async function NewLocationPage({
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
        /{" "}
        <Link href={`/clients/${id}`} className="hover:text-neutral-900">
          {client.name}
        </Link>{" "}
        /{" "}
        <Link href={`/clients/${id}/locations`} className="hover:text-neutral-900">
          Locations
        </Link>{" "}
        / New
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New location</h1>
      <div className="mt-6">
        <LocationForm
          action={createLocationAction.bind(null, id)}
          cancelHref={`/clients/${id}/locations`}
        />
      </div>
    </div>
  );
}
