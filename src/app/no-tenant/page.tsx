import { SignOutButton } from "@/components/sign-out-button";

export default function NoTenantPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">No tenant assigned</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Your account isn&rsquo;t a member of any tenant yet. Contact an administrator to be
        added.
      </p>
      <div className="mt-6 flex justify-center">
        <SignOutButton />
      </div>
    </main>
  );
}
