'use client';

import Image from 'next/image';
import { ExternalLink, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Article } from '@/lib/supabase';
import { formatRelativeTime, truncate, cn, getBiasBgColor } from '@/lib/utils';
import { getBiasLabel, getLocalizedTitle, getLocalizedSummary, type Language } from '@/lib/types';

interface ArticleCardProps {
  article: Article;
  showSource?: boolean;
  showBias?: boolean;
  className?: string;
  locale?: Language;
}

export function ArticleCard({
  article,
  showSource = true,
  showBias = true,
  className,
  locale = 'en'
}: ArticleCardProps) {
  const hasImage = article.image_url && article.image_url.startsWith('http');
  const source = article.source;
  const biasScore = article.ai_bias_score ?? source?.bias_score ?? 0;
  const title = getLocalizedTitle(article, locale);
  const articleSummary = getLocalizedSummary(article, locale);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <Card className={cn(
        'overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-brand-primary/30 h-full flex flex-col',
        className
      )}>
        {/* Image */}
        {hasImage && (
          <div className="relative w-full h-36 overflow-hidden">
            <Image
              src={article.image_url!}
              alt={article.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              unoptimized
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="p-4 flex flex-col flex-1">
          {/* Source & Bias */}
          {(showSource || showBias) && (
            <div className="flex items-center justify-between mb-2">
              {showSource && source && (
                <div className="flex items-center gap-2">
                  {source.logo_url && (
                    <Image
                      src={source.logo_url}
                      alt={source.name}
                      width={16}
                      height={16}
                      className="rounded"
                      unoptimized
                    />
                  )}
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {source.name}
                  </span>
                </div>
              )}
              {showBias && biasScore !== null && (
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full text-white',
                  getBiasBgColor(biasScore)
                )}>
                  {getBiasLabel(biasScore)}
                </span>
              )}
            </div>
          )}

          {/* Title */}
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-brand-primary transition-colors">
            {title}
          </h3>

          {/* Summary or excerpt */}
          {(articleSummary || article.excerpt) && (
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2 flex-1">
              {truncate(articleSummary || article.excerpt || '', 120)}
            </p>
          )}

          {/* Topics */}
          {article.topics && article.topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {article.topics.slice(0, 3).map((topic) => (
                <span
                  key={topic}
                  className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-auto pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {article.published_at 
                ? formatRelativeTime(article.published_at)
                : 'Unknown date'
              }
            </span>
            <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      </Card>
    </a>
  );
}

// Compact horizontal variant for story detail page
export function ArticleCardHorizontal({
  article,
  className,
  locale = 'en'
}: ArticleCardProps) {
  const hasImage = article.image_url && article.image_url.startsWith('http');
  const source = article.source;
  const biasScore = article.ai_bias_score ?? source?.bias_score ?? 0;
  const horizTitle = getLocalizedTitle(article, locale);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <Card className={cn(
        'p-4 hover:shadow-md transition-all duration-200 hover:border-brand-primary/30',
        className
      )}>
        <div className="flex gap-4">
          {/* Image */}
          {hasImage && (
            <div className="relative w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden">
              <Image
                src={article.image_url!}
                alt={article.title}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Source & Bias */}
            <div className="flex items-center justify-between mb-1">
              {source && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {source.name}
                </span>
              )}
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full text-white',
                getBiasBgColor(biasScore)
              )}>
                {getBiasLabel(biasScore)}
              </span>
            </div>

            {/* Title */}
            <h4 className="font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-brand-primary transition-colors">
              {horizTitle}
            </h4>

            {/* Meta */}
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
              {article.published_at && (
                <span>{formatRelativeTime(article.published_at)}</span>
              )}
              {article.author && (
                <>
                  <span>•</span>
                  <span>{article.author}</span>
                </>
              )}
              <ExternalLink className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </Card>
    </a>
  );
}
