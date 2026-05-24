import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">PM Facilities Platform</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Phase 1 — multi-tenant auth, users, and roles (in progress).
      </p>
      <div className="mt-8">
        <Link
          href="/login"
          className="inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
