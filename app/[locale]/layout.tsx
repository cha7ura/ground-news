import { Header } from '@/components/header';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Language } from '@/lib/types';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 ${locale === 'si' ? 'font-sinhala' : ''}`}>
      <html lang={locale} />
      <Header locale={locale} dict={dict} />
      <main>{children}</main>
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-brand-primary to-brand-secondary rounded flex items-center justify-center">
                <span className="text-white font-bold text-xs">GN</span>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {dict.footer.brand}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>{dict.footer.bias_ratings}:</span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-bias-left" />
                {dict.bias.left_leaning}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-bias-center" />
                {dict.bias.center}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-bias-right" />
                {dict.bias.right_leaning}
              </span>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
            {dict.common.bias_disclaimer}
          </p>
        </div>
      </footer>
    </div>
  );
}
