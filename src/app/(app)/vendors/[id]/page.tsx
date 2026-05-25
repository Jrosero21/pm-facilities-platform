import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/server/auth-context";
import { getVendor } from "@/server/vendors";
import { listVendorContacts } from "@/server/vendor-contacts";
import { createVendorContactAction } from "@/app/(app)/vendors/contact-actions";
import { ContactForm } from "@/components/contact-form";
import { ContactList } from "@/components/contact-list";

const typeLabel: Record<string, string> = {
  local: "Local",
  regional: "Regional",
  national: "National",
};

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenant();
  const vendor = await getVendor(ctx.activeTenant.tenantId, id);

  if (!vendor) notFound();

  const contacts = await listVendorContacts(ctx.activeTenant.tenantId, id);
  const addContact = createVendorContactAction.bind(null, id);

  const fields: { label: string; value: string | null }[] = [
    { label: "Type", value: typeLabel[vendor.vendorType] ?? vendor.vendorType },
    { label: "Vendor code", value: vendor.vendorCode },
    { label: "Legal name", value: vendor.legalName },
    { label: "Status", value: vendor.status },
    { label: "Main phone", value: vendor.mainPhone },
    { label: "Main email", value: vendor.mainEmail },
    { label: "Website", value: vendor.website },
    { label: "Tax ID / EIN", value: vendor.taxId },
  ];

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/vendors" className="hover:text-neutral-900">
          Vendors
        </Link>{" "}
        / {vendor.name}
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{vendor.name}</h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">{f.label}</dt>
            <dd className="mt-1 text-sm font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {vendor.notes && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{vendor.notes}</dd>
        </div>
      )}

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
