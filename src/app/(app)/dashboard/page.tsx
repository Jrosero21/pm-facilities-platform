import { requireTenant } from "@/server/auth-context";

export default async function DashboardPage() {
  const ctx = await requireTenant();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">User</dt>
          <dd className="mt-1 text-sm font-medium">
            {ctx.user.name} ({ctx.user.email})
          </dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Active tenant</dt>
          <dd className="mt-1 text-sm font-medium">
            {ctx.activeTenant.tenantName}{" "}
            <span className="text-neutral-500">({ctx.activeTenant.tenantType})</span>
          </dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Roles</dt>
          <dd className="mt-1 text-sm font-medium">{ctx.roleKeys.join(", ") || "—"}</dd>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Memberships</dt>
          <dd className="mt-1 text-sm font-medium">{ctx.memberships.length}</dd>
        </div>
      </dl>

      <p className="mt-8 text-xs text-neutral-500">
        Phase 1 dashboard stub. Real navigation and operational views begin in later phases.
      </p>
    </div>
  );
}
