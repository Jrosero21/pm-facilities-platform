import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Signed in as <span className="font-medium">{session.user.email}</span> ({session.user.name})
      </p>
      <p className="mt-6 text-xs text-neutral-500">
        Phase 1 stub. Tenant guard, navigation, and the full app shell come in later chunks.
      </p>
    </main>
  );
}
