import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Forge',
  description: 'AI-first project management system',
};

const navItems = [
  { href: '/board', label: 'Board' },
  { href: '/documents', label: 'Documents' },
  { href: '/diffs', label: 'Diffs' },
  { href: '/skills', label: 'Skills' },
  { href: '/context', label: 'Context' },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <Providers>
          <nav className="border-b border-gray-200 bg-white">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex h-14 items-center gap-8">
                <Link href="/" className="text-lg font-semibold text-gray-900">
                  Forge
                </Link>
                <div className="flex gap-6">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
                <div className="ml-auto">
                  <Link href="/account" className="text-sm text-gray-600 hover:text-gray-900">
                    Account
                  </Link>
                </div>
              </div>
            </div>
          </nav>
          <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
