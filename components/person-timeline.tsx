'use client';

import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { Article } from '@/lib/supabase';
import { getBiasBgColor } from '@/lib/utils';
import { getLocalizedTitle, getBiasLabel, type Language } from '@/lib/types';

interface PersonTimelineProps {
  articles: Article[];
  locale: Language;
}

export function PersonTimeline({ articles, locale }: PersonTimelineProps) {
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
                  <div className="w-3 h-3 rounded-full bg-brand-primary border-2 border-white dark:border-gray-900" />
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
                      {article.source && (
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {article.source.name}
                        </span>
                      )}
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
