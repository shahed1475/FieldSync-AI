import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-gray-900">OtriX</h1>
        <p className="mt-4 text-xl text-gray-600">AI-Powered Code Generation Platform</p>
        <div className="mt-8 flex gap-4 justify-center">
          <Link
            href="/admin"
            className="rounded-lg bg-primary px-6 py-3 text-white hover:bg-primary/90"
          >
            Admin Dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-gray-700 hover:bg-gray-50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
