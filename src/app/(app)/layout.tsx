import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { requireAuth } from "@/server/auth-context";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold">PM Facilities</span>
            {ctx.activeTenant && (
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {ctx.activeTenant.tenantName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">{ctx.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
