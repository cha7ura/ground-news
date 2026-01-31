import { Suspense } from 'react';
import { StoryCard } from '@/components/story-card';
import { ArticleCard } from '@/components/article-card';
import { getStories, getLatestArticles } from '@/lib/supabase';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { Newspaper, TrendingUp, Clock } from 'lucide-react';
import type { Language } from '@/lib/types';

// Revalidate every 5 minutes
export const revalidate = 300;

interface HomePageProps {
  params: { locale: string };
}

async function FeaturedStories({ locale, dict }: { locale: Language; dict: Record<string, any> }) {
  const stories = await getStories(10);

  if (stories.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <Newspaper className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">{dict.home.no_stories_title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {dict.home.no_stories_desc}
        </p>
      </div>
    );
  }

  const [featured, ...rest] = stories;

  return (
    <div className="space-y-6">
      {featured && (
        <StoryCard story={featured} variant="featured" locale={locale} />
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rest.map((story) => (
            <StoryCard key={story.id} story={story} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

async function LatestArticles({ locale, dict }: { locale: Language; dict: Record<string, any> }) {
  const articles = await getLatestArticles(6);

  if (articles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{dict.home.latest_articles}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} locale={locale} />
        ))}
      </div>
    </div>
  );
}

function StoriesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-pulse">
        <div className="flex flex-col md:flex-row">
          <div className="w-full md:w-1/2 h-48 md:h-64 bg-gray-200 dark:bg-gray-700" />
          <div className="p-6 md:w-1/2">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-pulse">
            <div className="h-40 bg-gray-200 dark:bg-gray-700" />
            <div className="p-4">
              <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function HomePage({ params }: HomePageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero section */}
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
          {dict.home.hero_title}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {dict.home.hero_subtitle}
        </p>
      </div>

      {/* Bias legend */}
      <div className="flex justify-center gap-6 mb-8 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-bias-left" />
          <span className="text-gray-600 dark:text-gray-400">{dict.bias.left_leaning}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-bias-center" />
          <span className="text-gray-600 dark:text-gray-400">{dict.bias.center}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full bg-bias-right" />
          <span className="text-gray-600 dark:text-gray-400">{dict.bias.right_leaning}</span>
        </div>
      </div>

      {/* Top Stories */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-brand-primary" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{dict.home.top_stories}</h2>
        </div>
        <Suspense fallback={<StoriesSkeleton />}>
          <FeaturedStories locale={locale} dict={dict} />
        </Suspense>
      </section>

      {/* Latest Articles */}
      <section>
        <Suspense fallback={null}>
          <LatestArticles locale={locale} dict={dict} />
        </Suspense>
      </section>
    </div>
  );
}
