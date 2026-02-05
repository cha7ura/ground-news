'use client';

import { ExternalLink, Quote, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Article } from '@/lib/supabase';
import { getBiasBgColor, getArticleTypeBadge, cn } from '@/lib/utils';
import { getLocalizedTitle, getBiasLabel, type Language } from '@/lib/types';

interface PersonTimelineProps {
  articles: Article[];
  locale: Language;
  /** Show casualties info for incident timelines */
  showCasualties?: boolean;
}

export function PersonTimeline({ articles, locale, showCasualties = false }: PersonTimelineProps) {
  // Sort chronologically (oldest first)
  const sorted = [...articles]
    .filter(a => a.published_at)
    .sort((a, b) =>
      new Date(a.published_at!).getTime() - new Date(b.published_at!).getTime()
    );

  // Articles without dates go at the end
  const undated = articles.filter(a => !a.published_at);
  const allArticles = [...sorted, ...undated];

  if (allArticles.length === 0) return null;

  let currentMonth = '';

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-4">
        {allArticles.map((article) => {
          const date = article.published_at
            ? new Date(article.published_at)
            : null;
          const monthKey = date
            ? `${date.getFullYear()}-${date.getMonth()}`
            : 'unknown';
          const showMonthHeader = monthKey !== currentMonth;
          if (showMonthHeader) currentMonth = monthKey;

          const title = getLocalizedTitle(article, locale);
          const biasScore = article.ai_bias_score ?? article.source?.bias_score ?? 0;
          const typeBadge = getArticleTypeBadge(article.article_type, locale);
          const firstQuote = article.key_quotes?.[0];
          const hasCasualties = showCasualties &&
            (article.casualties?.deaths ?? 0) + (article.casualties?.injuries ?? 0) > 0;

          return (
            <div key={article.id}>
              {showMonthHeader && date && (
                <div className="ml-10 mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                  {date.toLocaleDateString(locale === 'si' ? 'si-LK' : 'en-GB', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              )}
              <div className="relative flex items-start gap-4">
                {/* Timeline dot */}
                <div className="relative z-10 w-8 h-8 flex items-center justify-center shrink-0">
                  <div className={cn(
                    'w-3 h-3 rounded-full border-2 border-white dark:border-gray-900',
                    hasCasualties ? 'bg-red-500' : 'bg-brand-primary'
                  )} />
                </div>

                {/* Article card */}
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 group"
                >
                  <Card className="p-3 hover:shadow-md hover:border-brand-primary/30 transition-all">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        {article.source && (
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {article.source.name}
                          </span>
                        )}
                        {typeBadge && (
                          <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', typeBadge.className)}>
                            {typeBadge.label}
                          </span>
                        )}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full text-white shrink-0 ${getBiasBgColor(biasScore)}`}>
                        {getBiasLabel(biasScore)}
                      </span>
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-brand-primary transition-colors text-sm">
                      {title}
                    </h4>
                    {article.summary && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                        {article.summary}
                      </p>
                    )}

                    {/* Key quote */}
                    {firstQuote && (
                      <div className="flex items-start gap-1.5 mt-2 pl-2 border-l-2 border-brand-primary/30">
                        <Quote className="h-3 w-3 text-brand-primary/50 shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-600 dark:text-gray-300 italic line-clamp-2">
                          {firstQuote}
                        </p>
                      </div>
                    )}

                    {/* Casualties badge */}
                    {hasCasualties && article.casualties && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                        <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                          {article.casualties.deaths > 0 && `${article.casualties.deaths} ${locale === 'si' ? 'මරණ' : 'deaths'}`}
                          {article.casualties.deaths > 0 && article.casualties.injuries > 0 && ', '}
                          {article.casualties.injuries > 0 && `${article.casualties.injuries} ${locale === 'si' ? 'තුවාල' : 'injuries'}`}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      {date && (
                        <span>
                          {date.toLocaleDateString(locale === 'si' ? 'si-LK' : 'en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                      {article.reading_time && (
                        <>
                          <span>·</span>
                          <span>{article.reading_time} min</span>
                        </>
                      )}
                      {article.author && (
                        <>
                          <span>·</span>
                          <span>{article.author}</span>
                        </>
                      )}
                      <ExternalLink className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Card>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
