import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { VendorForm } from "@/components/vendor-form";

export default async function NewVendorPage() {
  await requireTenant();

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/vendors" className="hover:text-neutral-900">
          Vendors
        </Link>{" "}
        / New
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New vendor</h1>
      <div className="mt-6">
        <VendorForm />
      </div>
    </div>
  );
}
