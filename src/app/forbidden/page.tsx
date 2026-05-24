import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Your account doesn&rsquo;t have permission to view this page.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 text-sm font-medium text-neutral-900 underline underline-offset-4"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
