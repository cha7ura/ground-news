'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Language } from '@/lib/types';

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'EN',
  si: 'සිං',
};

export function LanguageSwitcher({ locale }: { locale: Language }) {
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = () => {
    const newLocale: Language = locale === 'en' ? 'si' : 'en';

    // Replace the locale prefix in the current path
    const segments = pathname.split('/');
    segments[1] = newLocale;
    const newPath = segments.join('/');

    // Set cookie for persistence
    document.cookie = `locale=${newLocale};path=/;max-age=${60 * 60 * 24 * 365}`;

    router.push(newPath);
  };

  const otherLocale: Language = locale === 'en' ? 'si' : 'en';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={switchLocale}
      className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-brand-primary"
    >
      <Globe className="h-4 w-4" />
      <span>{LANGUAGE_LABELS[otherLocale]}</span>
    </Button>
  );
}
