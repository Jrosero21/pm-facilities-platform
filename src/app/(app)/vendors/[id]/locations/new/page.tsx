import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getVendor } from "@/server/vendors";
import { LocationForm } from "@/components/location-form";
import { createVendorLocationAction } from "@/app/(app)/vendors/location-actions";

export default async function NewVendorLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();

  const vendor = await getVendor(ctx.activeTenant.tenantId, id);
  if (!vendor) notFound();

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/vendors" className="hover:text-neutral-900">
          Vendors
        </Link>{" "}
        /{" "}
        <Link href={`/vendors/${id}`} className="hover:text-neutral-900">
          {vendor.name}
        </Link>{" "}
        /{" "}
        <Link href={`/vendors/${id}/locations`} className="hover:text-neutral-900">
          Locations
        </Link>{" "}
        / New
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New location</h1>
      <div className="mt-6">
        <LocationForm
          action={createVendorLocationAction.bind(null, id)}
          cancelHref={`/vendors/${id}/locations`}
        />
      </div>
    </div>
  );
}
