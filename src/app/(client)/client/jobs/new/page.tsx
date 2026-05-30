import Link from "next/link";
import { requireClient } from "@/server/auth-context";
import { listClientsInScope } from "@/server/client/list-clients-in-scope";
import { listClientScopedLocations } from "@/server/client/list-client-scoped-locations";
import { NewJobForm } from "@/components/client/new-job-form";

/**
 * Client work-order submission page — Phase 11 batch 11f (the WRITE entry point).
 *
 * requireClient() guarantees a non-empty scope; we still render a safe empty-state
 * if no submittable client/location substrate exists (defense in depth). Ships the
 * scope-filtered client + location options to the client form; all pinning and
 * re-validation happens server-side in createClientJobAction → createClientJob.
 */
export default async function NewClientJobPage() {
  const ctx = await requireClient();
  const [clients, locations] = await Promise.all([
    listClientsInScope(ctx.activeTenant.tenantId, ctx.clientScope),
    listClientScopedLocations(ctx.activeTenant.tenantId, ctx.clientScope),
  ]);

  const canSubmit = clients.length > 0 && locations.length > 0;

  return (
    <section className="max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          New work order
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Tell us what needs attention and where. Our team will triage it from
          here.
        </p>
      </header>

      {canSubmit ? (
        <NewJobForm clients={clients} locations={locations} />
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
          <p>
            No locations are set up for your account yet, so a work order
            can&rsquo;t be submitted. Please contact your administrator.
          </p>
          <Link
            href="/client/jobs"
            className="mt-3 inline-block font-medium text-neutral-900 underline underline-offset-4"
          >
            Back to work orders
          </Link>
        </div>
      )}
    </section>
  );
}
