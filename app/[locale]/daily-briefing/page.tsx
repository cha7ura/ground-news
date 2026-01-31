import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Newspaper, Shield, Calendar, ArrowRight, ChevronRight } from 'lucide-react';
import { getDailyBriefing, getStories } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { BiasIndicator } from '@/components/bias-indicator';
import { formatRelativeTime, cn } from '@/lib/utils';
import { getLocalizedTitle, getLocalizedSummary, type Language } from '@/lib/types';
import { getDictionary } from '@/lib/i18n/get-dictionary';

export const revalidate = 300;

async function TodaysBriefing() {
  // Try to get actual briefing, fall back to latest stories
  const briefing = await getDailyBriefing();
  const stories = briefing?.stories || await getStories(10);
  
  if (stories.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Newspaper className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No briefing available</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Check back later for today's news briefing.
        </p>
      </Card>
    );
  }

  const [featured, ...rest] = stories;
  const totalArticles = stories.reduce((sum, s) => sum + s.article_count, 0);
  const totalReadingTime = Math.ceil(totalArticles * 2); // ~2 min per article average
  const originalReportingPct = briefing?.original_reporting_percentage || 75;

  return (
    <div className="space-y-6">
      {/* Briefing stats bar */}
      <Card className="p-4 bg-gradient-to-r from-brand-primary to-brand-secondary text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              <span className="font-medium">{stories.length} stories</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/80">{totalArticles} articles</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{totalReadingTime}m read</span>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-sm">
            <Shield className="h-4 w-4" />
            <span>{originalReportingPct}% of sources are Original Reporting</span>
          </div>
        </div>
      </Card>

      {/* Featured story */}
      {featured && (
        <Link href={`/story/${featured.id}`}>
          <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 group">
            <div className="flex flex-col md:flex-row">
              {featured.image_url && (
                <div className="relative w-full md:w-1/2 h-48 md:h-64">
                  <Image
                    src={featured.image_url}
                    alt={featured.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent md:hidden" />
                </div>
              )}
              <div className={cn(
                'p-6 flex flex-col justify-center',
                featured.image_url ? 'md:w-1/2' : 'w-full'
              )}>
                {featured.primary_topic && (
                  <span className="text-xs font-bold text-brand-primary uppercase tracking-wide mb-2">
                    {featured.primary_topic}
                  </span>
                )}
                <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-brand-primary transition-colors">
                  {featured.title}
                </h2>
                {featured.summary && (
                  <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {featured.summary}
                  </p>
                )}
                <BiasIndicator distribution={featured.bias_distribution} size="sm" />
                <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
                  <span>{featured.source_count} sources</span>
                  <span>{featured.article_count} articles</span>
                </div>
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* Rest of stories */}
      {rest.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">More Stories</h2>
          {rest.map((story, index) => (
            <Link key={story.id} href={`/story/${story.id}`}>
              <Card className="p-4 hover:shadow-md transition-all duration-200 hover:border-brand-primary/30 group">
                <div className="flex gap-4">
                  {/* Index number */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-500 dark:text-gray-400 group-hover:bg-brand-primary group-hover:text-white transition-colors">
                    {index + 2}
                  </div>

                  {/* Image */}
                  {story.image_url && (
                    <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                      <Image
                        src={story.image_url}
                        alt={story.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {story.primary_topic && (
                      <span className="text-xs font-medium text-brand-primary uppercase">
                        {story.primary_topic}
                      </span>
                    )}
                    <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-brand-primary transition-colors">
                      {story.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{story.source_count} sources</span>
                      <span>•</span>
                      <span>{story.article_count} articles</span>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-4 bg-gray-200 dark:bg-gray-700 animate-pulse h-16" />
      <Card className="overflow-hidden animate-pulse">
        <div className="flex flex-col md:flex-row">
          <div className="w-full md:w-1/2 h-48 md:h-64 bg-gray-200 dark:bg-gray-700" />
          <div className="p-6 md:w-1/2">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </Card>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="flex gap-4">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              <div className="flex-1">
                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface DailyBriefingPageProps {
  params: { locale: string };
}

export default async function DailyBriefingPage({ params }: DailyBriefingPageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-brand-primary/10 rounded-lg">
            <Newspaper className="h-6 w-6 text-brand-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Briefing</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              <span>{today}</span>
            </div>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Your daily digest of the most important Sri Lankan news stories, 
          with coverage from multiple sources across the political spectrum.
        </p>
      </div>

      {/* Briefing content */}
      <Suspense fallback={<BriefingSkeleton />}>
        <TodaysBriefing />
      </Suspense>

      {/* Archive link */}
      <Card className="p-4 mt-8 flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">Previous Briefings</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Browse past daily briefings</p>
        </div>
        <Link
          href={`/${locale}/daily-briefing/archive`}
          className="flex items-center gap-1 text-brand-primary font-medium hover:underline"
        >
          {dict.briefing.view_archive}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>
    </div>
  );
}
