import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Newspaper, ExternalLink } from 'lucide-react';
import { getStoryWithArticles } from '@/lib/supabase';
import { BiasIndicator } from '@/components/bias-indicator';
import { ArticleCardHorizontal } from '@/components/article-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatRelativeTime, cn, getBiasBgColor, getArticleTypeBadge } from '@/lib/utils';
import { getBiasLabel, getBiasCategory, getLocalizedTitle, getLocalizedSummary, type Language } from '@/lib/types';
import { getDictionary } from '@/lib/i18n/get-dictionary';

interface StoryPageProps {
  params: { id: string; locale: string };
}

export const revalidate = 60;

export default async function StoryPage({ params }: StoryPageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);
  const story = await getStoryWithArticles(params.id);

  if (!story) {
    notFound();
  }

  const articles = story.articles || [];
  
  // Group articles by bias category
  const articlesByBias = {
    left: articles.filter(a => {
      const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
      return getBiasCategory(score) === 'left';
    }),
    center: articles.filter(a => {
      const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
      return getBiasCategory(score) === 'center';
    }),
    right: articles.filter(a => {
      const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
      return getBiasCategory(score) === 'right';
    }),
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <Link href={`/${locale}`}>
        <Button variant="ghost" className="mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {dict.story.back}
        </Button>
      </Link>

      {/* Story header */}
      <div className="mb-8">
        {story.primary_topic && (
          <span className="inline-block px-3 py-1 text-sm font-medium bg-brand-primary/10 text-brand-primary rounded-full mb-4">
            {story.primary_topic}
          </span>
        )}

        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
          {getLocalizedTitle(story, locale)}
        </h1>

        {getLocalizedSummary(story, locale) && (
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            {getLocalizedSummary(story, locale)}
          </p>
        )}

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <span className="flex items-center gap-1">
            <Newspaper className="h-4 w-4" />
            {story.source_count} sources
          </span>
          <span>{story.article_count} articles</span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Updated {formatRelativeTime(story.last_updated_at)}
          </span>
        </div>

        {/* Bias distribution */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{dict.story.coverage_breakdown}</h2>
          <BiasIndicator distribution={story.bias_distribution} size="lg" />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
            This story has been covered by {story.source_count} source{story.source_count !== 1 ? 's' : ''} 
            with varying political perspectives.
          </p>
        </Card>
      </div>

      {/* Source comparison */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{dict.story.compare_sources}</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left sources */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-4 h-4 rounded-full bg-bias-left" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {dict.story.left_leaning} ({articlesByBias.left.length})
              </h3>
            </div>
            {articlesByBias.left.length > 0 ? (
              <div className="space-y-3">
                {articlesByBias.left.map((article) => (
                  <ArticleCardHorizontal key={article.id} article={article} locale={locale} />
                ))}
              </div>
            ) : (
              <Card className="p-6 bg-gray-50 dark:bg-gray-900 border-dashed">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  No left-leaning coverage
                </p>
              </Card>
            )}
          </div>

          {/* Center sources */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-4 h-4 rounded-full bg-bias-center" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {dict.story.center} ({articlesByBias.center.length})
              </h3>
            </div>
            {articlesByBias.center.length > 0 ? (
              <div className="space-y-3">
                {articlesByBias.center.map((article) => (
                  <ArticleCardHorizontal key={article.id} article={article} locale={locale} />
                ))}
              </div>
            ) : (
              <Card className="p-6 bg-gray-50 dark:bg-gray-900 border-dashed">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  No center coverage
                </p>
              </Card>
            )}
          </div>

          {/* Right sources */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-4 h-4 rounded-full bg-bias-right" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {dict.story.right_leaning} ({articlesByBias.right.length})
              </h3>
            </div>
            {articlesByBias.right.length > 0 ? (
              <div className="space-y-3">
                {articlesByBias.right.map((article) => (
                  <ArticleCardHorizontal key={article.id} article={article} locale={locale} />
                ))}
              </div>
            ) : (
              <Card className="p-6 bg-gray-50 dark:bg-gray-900 border-dashed">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  No right-leaning coverage
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* All articles list */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">All Articles ({articles.length})</h2>
        <div className="space-y-4">
          {articles.map((article) => {
            const biasScore = article.ai_bias_score ?? article.source?.bias_score ?? 0;
            const typeBadge = getArticleTypeBadge(article.article_type, locale);
            return (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <Card className="p-4 hover:shadow-md transition-all duration-200 hover:border-brand-primary/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          {article.source?.name || 'Unknown Source'}
                        </span>
                        {typeBadge && (
                          <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', typeBadge.className)}>
                            {typeBadge.label}
                          </span>
                        )}
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full text-white',
                          getBiasBgColor(biasScore)
                        )}>
                          {getBiasLabel(biasScore)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-brand-primary transition-colors">
                        {article.title}
                      </h3>
                      {article.summary && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                          {article.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {article.published_at && (
                          <span>{formatRelativeTime(article.published_at)}</span>
                        )}
                        {article.reading_time && (
                          <>
                            <span>•</span>
                            <span>{article.reading_time} min read</span>
                          </>
                        )}
                        {article.author && (
                          <>
                            <span>•</span>
                            <span>By {article.author}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Card>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
