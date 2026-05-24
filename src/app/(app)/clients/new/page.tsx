import Link from "next/link";
import { requireTenant } from "@/server/auth-context";
import { ClientForm } from "@/components/client-form";

export default async function NewClientPage() {
  await requireTenant();

  return (
    <div>
      <div className="text-sm text-neutral-500">
        <Link href="/clients" className="hover:text-neutral-900">
          Clients
        </Link>{" "}
        / New
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">New client</h1>
      <div className="mt-6">
        <ClientForm />
      </div>
    </div>
  );
}
