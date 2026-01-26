import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/header';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Ground News Sri Lanka',
  description: 'See every side of every news story in Sri Lanka. Compare coverage from multiple sources and identify media bias.',
  keywords: ['Sri Lanka', 'news', 'media bias', 'news aggregator', 'Daily Mirror', 'news comparison'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          <Header />
          <main>{children}</main>
          <footer className="bg-white border-t border-gray-200 py-8 mt-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-brand-primary to-brand-secondary rounded flex items-center justify-center">
                    <span className="text-white font-bold text-xs">GN</span>
                  </div>
                  <span className="text-sm text-gray-600">
                    Ground News Sri Lanka
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>Bias Ratings:</span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-bias-left" />
                    Left
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-bias-center" />
                    Center
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-bias-right" />
                    Right
                  </span>
                </div>
              </div>
              <p className="text-center text-xs text-gray-400 mt-6">
                Compare news coverage across Sri Lankan media sources. Bias ratings are AI-generated and for informational purposes only.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
