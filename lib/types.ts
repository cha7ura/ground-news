// Shared types for Ground News SL

// ============================================
// Language / i18n types
// ============================================
export type Language = 'en' | 'si';

// ============================================
// Bias types
// ============================================
export type BiasCategory = 'left' | 'center' | 'right';

export interface BiasDistribution {
  left: number;
  center: number;
  right: number;
}

export function getBiasCategory(score: number): BiasCategory {
  if (score < -0.3) return 'left';
  if (score > 0.3) return 'right';
  return 'center';
}

export function getBiasLabel(score: number): string {
  if (score <= -0.6) return 'Far Left';
  if (score <= -0.3) return 'Left';
  if (score < 0.3) return 'Center';
  if (score < 0.6) return 'Right';
  return 'Far Right';
}

export function getBiasPercentage(distribution: BiasDistribution): {
  left: number;
  center: number;
  right: number;
} {
  const total = distribution.left + distribution.center + distribution.right;
  if (total === 0) return { left: 0, center: 100, right: 0 };
  
  return {
    left: Math.round((distribution.left / total) * 100),
    center: Math.round((distribution.center / total) * 100),
    right: Math.round((distribution.right / total) * 100),
  };
}

// Topic categories for Sri Lankan news
export const TOPIC_CATEGORIES = [
  'politics',
  'economy',
  'business',
  'cricket',
  'sports',
  'tourism',
  'education',
  'health',
  'crime',
  'environment',
  'technology',
  'international',
  'entertainment',
] as const;

export type TopicCategory = typeof TOPIC_CATEGORIES[number];

// ============================================
// Tag types
// ============================================
export type TagType = 'person' | 'organization' | 'location' | 'topic' | 'event' | 'custom';

export interface Tag {
  id: string;
  name: string;
  name_si: string | null;
  slug: string;
  type: TagType;
  description: string | null;
  description_si: string | null;
  article_count: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ArticleTag {
  id: string;
  article_id: string;
  tag_id: string;
  confidence: number;
  source: 'ai' | 'manual';
  created_at: string;
  tag?: Tag;
}

// ============================================
// Locale helpers
// ============================================

/**
 * Get the localized title for an article based on the current locale.
 * Falls back to the original title if no translation exists.
 */
export function getLocalizedTitle(
  item: { title: string; title_si?: string | null; title_en?: string | null; language?: string },
  locale: Language
): string {
  if (locale === 'si') {
    if (item.language === 'si') return item.title;
    return item.title_si || item.title;
  }
  if (item.language === 'en') return item.title;
  return item.title_en || item.title;
}

/**
 * Get the localized summary for an article based on the current locale.
 */
export function getLocalizedSummary(
  item: { summary?: string | null; summary_si?: string | null; summary_en?: string | null; language?: string },
  locale: Language
): string | null {
  if (locale === 'si') {
    if (item.language === 'si') return item.summary || null;
    return item.summary_si || item.summary || null;
  }
  if (item.language === 'en') return item.summary || null;
  return item.summary_en || item.summary || null;
}

/**
 * Get the localized name for a tag based on the current locale.
 */
export function getLocalizedTagName(tag: { name: string; name_si?: string | null }, locale: Language): string {
  if (locale === 'si') return tag.name_si || tag.name;
  return tag.name;
}
