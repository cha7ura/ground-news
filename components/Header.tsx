import Link from 'next/link';

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto px-4 py-4">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            Sri Lanka News
          </Link>
          <div className="flex gap-6">
            <Link
              href="/"
              className="text-gray-700 hover:text-blue-600 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/admin/sources"
              className="text-gray-700 hover:text-blue-600 transition-colors"
            >
              Manage Sources
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

