'use client';

import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Article, Source } from '@/lib/supabase';
import { cn, truncate } from '@/lib/utils';
import { getBiasCategory } from '@/lib/types';

interface SourceComparisonWidgetProps {
  articles: (Article & { source?: Source })[];
  storyUrl?: string;
  className?: string;
}

export function SourceComparisonWidget({ 
  articles, 
  storyUrl,
  className 
}: SourceComparisonWidgetProps) {
  // Group articles by bias category and take one from each
  const leftArticle = articles.find(a => {
    const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
    return getBiasCategory(score) === 'left';
  });
  
  const centerArticle = articles.find(a => {
    const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
    return getBiasCategory(score) === 'center';
  });
  
  const rightArticle = articles.find(a => {
    const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
    return getBiasCategory(score) === 'right';
  });

  const sourceCount = articles.length;
  const displayedCount = [leftArticle, centerArticle, rightArticle].filter(Boolean).length;

  if (displayedCount === 0) {
    return null;
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="divide-y divide-gray-100">
        {/* Source headlines */}
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {/* Left source */}
          <SourceSlot 
            article={leftArticle} 
            label="LEFT" 
            bgColor="bg-bias-left/5"
            textColor="text-bias-left"
          />
          
          {/* Center source */}
          <SourceSlot 
            article={centerArticle} 
            label="CENTER" 
            bgColor="bg-bias-center/5"
            textColor="text-bias-center"
          />
          
          {/* Right source */}
          <SourceSlot 
            article={rightArticle} 
            label="RIGHT" 
            bgColor="bg-bias-right/5"
            textColor="text-bias-right"
          />
        </div>

        {/* Footer with source count */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-xs text-gray-500">
          <span>{displayedCount} / {sourceCount} sources</span>
          {storyUrl && (
            <a 
              href={storyUrl}
              className="flex items-center gap-1 text-brand-primary hover:underline"
            >
              Read more
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

interface SourceSlotProps {
  article?: Article & { source?: Source };
  label: string;
  bgColor: string;
  textColor: string;
}

function SourceSlot({ article, label, bgColor, textColor }: SourceSlotProps) {
  if (!article) {
    return (
      <div className={cn('p-3 text-center', bgColor)}>
        <div className={cn('text-[10px] font-bold mb-2', textColor)}>{label}</div>
        <p className="text-xs text-gray-400 italic">No coverage</p>
      </div>
    );
  }

  const source = article.source;

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('p-3 hover:bg-gray-50 transition-colors block', bgColor)}
    >
      <div className={cn('text-[10px] font-bold mb-2', textColor)}>{label}</div>
      
      {/* Source info */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {source?.favicon_url && (
          <Image
            src={source.favicon_url}
            alt=""
            width={12}
            height={12}
            className="rounded"
            unoptimized
          />
        )}
        <span className="text-[10px] text-gray-500 truncate">
          {source?.name || 'Unknown'}
        </span>
      </div>
      
      {/* Headline */}
      <p className="text-xs font-medium text-gray-900 line-clamp-3">
        {article.title}
      </p>
    </a>
  );
}

// Compact horizontal version
export function SourceComparisonBar({ 
  articles,
  className 
}: SourceComparisonWidgetProps) {
  const leftCount = articles.filter(a => {
    const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
    return getBiasCategory(score) === 'left';
  }).length;
  
  const centerCount = articles.filter(a => {
    const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
    return getBiasCategory(score) === 'center';
  }).length;
  
  const rightCount = articles.filter(a => {
    const score = a.ai_bias_score ?? a.source?.bias_score ?? 0;
    return getBiasCategory(score) === 'right';
  }).length;

  const total = articles.length;

  return (
    <div className={cn('flex items-center gap-3 text-xs', className)}>
      <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-gray-200">
        {leftCount > 0 && (
          <div 
            className="bg-bias-left"
            style={{ width: `${(leftCount / total) * 100}%` }}
          />
        )}
        {centerCount > 0 && (
          <div 
            className="bg-bias-center"
            style={{ width: `${(centerCount / total) * 100}%` }}
          />
        )}
        {rightCount > 0 && (
          <div 
            className="bg-bias-right"
            style={{ width: `${(rightCount / total) * 100}%` }}
          />
        )}
      </div>
      <span className="text-gray-500 whitespace-nowrap">
        {total} sources
      </span>
    </div>
  );
}
