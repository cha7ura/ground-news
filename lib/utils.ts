import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return then.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length).trim() + '...';
}

export function getBiasColor(score: number): string {
  if (score < -0.3) return 'text-bias-left';
  if (score > 0.3) return 'text-bias-right';
  return 'text-bias-center';
}

export function getBiasBgColor(score: number): string {
  if (score < -0.3) return 'bg-bias-left';
  if (score > 0.3) return 'bg-bias-right';
  return 'bg-bias-center';
}

const ARTICLE_TYPE_LABELS: Record<string, Record<string, string>> = {
  opinion: { en: 'Opinion', si: 'අදහස්' },
  analysis: { en: 'Analysis', si: 'විශ්ලේෂණය' },
  interview: { en: 'Interview', si: 'සම්මුඛ සාකච්ඡාව' },
};

const ARTICLE_TYPE_CLASSES: Record<string, string> = {
  opinion: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  analysis: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  interview: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

/**
 * Get badge styling for non-default article types.
 * Returns null for 'news' (default type — no badge needed).
 */
export function getArticleTypeBadge(type: string | null | undefined, locale: string = 'en'): {
  label: string;
  className: string;
} | null {
  if (!type || type === 'news') return null;
  const labels = ARTICLE_TYPE_LABELS[type];
  const className = ARTICLE_TYPE_CLASSES[type];
  if (!labels || !className) return null;
  return { label: labels[locale] || labels.en, className };
}
