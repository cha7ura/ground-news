'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Clock, Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { BiasIndicator } from '@/components/bias-indicator';
import { BlindspotIndicator } from '@/components/blindspot-badge';
import { Story } from '@/lib/supabase';
import { formatRelativeTime, truncate, cn } from '@/lib/utils';
import { getLocalizedTitle, getLocalizedSummary, type Language } from '@/lib/types';

interface StoryCardProps {
  story: Story;
  variant?: 'default' | 'compact' | 'featured';
  className?: string;
  locale?: Language;
}

export function StoryCard({ story, variant = 'default', className, locale = 'en' }: StoryCardProps) {
  const hasImage = story.image_url && story.image_url.startsWith('http');
  const title = getLocalizedTitle(story, locale);
  const summary = getLocalizedSummary(story, locale);
  const linkPrefix = `/${locale}`;

  if (variant === 'featured') {
    return (
      <Link href={`${linkPrefix}/story/${story.id}`}>
        <Card className={cn(
          'group overflow-hidden hover:shadow-lg transition-all duration-200',
          className
        )}>
          <div className="flex flex-col md:flex-row">
            {/* Image */}
            {hasImage && (
              <div className="relative w-full md:w-1/2 h-48 md:h-auto md:min-h-[280px]">
                <Image
                  src={story.image_url!}
                  alt={title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  unoptimized
                />
              </div>
            )}

            {/* Content */}
            <div className={cn(
              'flex flex-col p-6',
              hasImage ? 'md:w-1/2' : 'w-full'
            )}>
              {/* Topic badge */}
              {story.primary_topic && (
                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-brand-primary/10 text-brand-primary rounded-full w-fit mb-3">
                  {story.primary_topic}
                </span>
              )}

              {/* Title */}
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-brand-primary transition-colors line-clamp-3">
                {title}
              </h2>

              {/* Summary */}
              {summary && (
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                  {summary}
                </p>
              )}

              {/* Blindspot indicator */}
              {story.is_blindspot && (
                <div className="mb-3">
                  <BlindspotIndicator type={story.blindspot_type} />
                </div>
              )}

              {/* Bias indicator */}
              <div className="mb-4">
                <BiasIndicator distribution={story.bias_distribution} size="md" />
              </div>

              {/* Meta */}
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-auto">
                <span className="flex items-center gap-1">
                  <Newspaper className="h-4 w-4" />
                  {story.source_count} sources
                </span>
                <span className="flex items-center gap-1">
                  {story.article_count} articles
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatRelativeTime(story.last_updated_at)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link href={`${linkPrefix}/story/${story.id}`}>
        <Card className={cn(
          'group p-4 hover:shadow-md transition-all duration-200 hover:border-brand-primary/30',
          className
        )}>
          <div className="flex gap-3">
            {/* Small thumbnail */}
            {hasImage && (
              <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                <Image
                  src={story.image_url!}
                  alt={title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Title */}
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 group-hover:text-brand-primary transition-colors">
                {title}
              </h3>

              {/* Meta row */}
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{story.source_count} sources</span>
                <span>•</span>
                <span>{formatRelativeTime(story.last_updated_at)}</span>
              </div>

              {/* Mini bias bar */}
              <div className="mt-2">
                <BiasIndicator 
                  distribution={story.bias_distribution} 
                  showLabels={false} 
                  size="sm" 
                />
              </div>
            </div>
          </div>
        </Card>
      </Link>
    );
  }

  // Default variant
  return (
    <Link href={`${linkPrefix}/story/${story.id}`}>
      <Card className={cn(
        'group overflow-hidden hover:shadow-lg transition-all duration-200 hover:border-brand-primary/30 h-full flex flex-col',
        className
      )}>
        {/* Image */}
        {hasImage && (
          <div className="relative w-full h-40 overflow-hidden">
            <Image
              src={story.image_url!}
              alt={title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              unoptimized
            />
            {story.is_trending && (
              <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
                Trending
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4 flex flex-col flex-1">
          {/* Topic */}
          {story.primary_topic && (
            <span className="text-xs font-medium text-brand-primary uppercase tracking-wide mb-2">
              {story.primary_topic}
            </span>
          )}

          {/* Title */}
          <h3 className="font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-brand-primary transition-colors">
            {title}
          </h3>

          {/* Summary */}
          {summary && (
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2 flex-1">
              {truncate(summary, 120)}
            </p>
          )}

          {/* Bias indicator */}
          <div className="mb-3">
            <BiasIndicator 
              distribution={story.bias_distribution} 
              size="sm"
              showLabels={false}
            />
          </div>

          {/* Meta */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-auto pt-2 border-t border-gray-100 dark:border-gray-800">
            <span className="flex items-center gap-1">
              <Newspaper className="h-3.5 w-3.5" />
              {story.source_count} sources • {story.article_count} articles
            </span>
            <span>{formatRelativeTime(story.last_updated_at)}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
