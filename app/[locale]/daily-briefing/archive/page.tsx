import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Newspaper } from 'lucide-react';
import { getRecentBriefings } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Language } from '@/lib/types';

export const revalidate = 300;

async function BriefingList() {
  const briefings = await getRecentBriefings(30);

  if (briefings.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Newspaper className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No past briefings</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Daily briefings will appear here once they are published.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {briefings.map((briefing) => {
        const date = new Date(briefing.briefing_date);
        const formatted = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        return (
          <Link key={briefing.id} href={`/daily-briefing?date=${briefing.briefing_date}`}>
            <Card className="p-4 hover:shadow-md transition-all duration-200 hover:border-brand-primary/30 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-brand-primary/10 rounded-lg group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    <Calendar className="h-5 w-5 text-brand-primary group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-brand-primary transition-colors">
                      {formatted}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                      <span>{briefing.story_count} stories</span>
                      <span>{briefing.article_count} articles</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

interface ArchivePageProps {
  params: { locale: string };
}

export default async function BriefingArchivePage({ params }: ArchivePageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={`/${locale}/daily-briefing`}
          className="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {dict.briefing.title}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{dict.briefing.previous}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{dict.briefing.previous_desc}</p>
      </div>

      <Suspense fallback={
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="flex-1">
                  <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                  <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      }>
        <BriefingList />
      </Suspense>
    </div>
  );
}
