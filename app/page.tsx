import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          WhatsApp Food Ordering
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Backend API services and Admin Dashboard active. Customers order directly via WhatsApp.
        </p>
        <div className="mt-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            Open Admin Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
