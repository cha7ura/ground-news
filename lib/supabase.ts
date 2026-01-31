import { createClient } from '@supabase/supabase-js';
import type { Tag, TagType } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('supabase');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database tables
export interface Source {
  id: string;
  name: string;
  slug: string;
  url: string;
  logo_url: string | null;
  favicon_url: string | null;
  bias_score: number;
  factuality_score: number;
  rss_url: string | null;
  scrape_config: Record<string, unknown>;
  is_active: boolean;
  last_scraped_at: string | null;
  article_count: number;
  description: string | null;
  country: string;
  language: string;
  languages: string[];
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: string;
  source_id: string;
  url: string;
  title: string;
  content: string | null;
  summary: string | null;
  excerpt: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  scraped_at: string;
  topics: string[];
  ai_bias_score: number | null;
  ai_sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
  ai_enriched_at: string | null;
  story_id: string | null;
  is_processed: boolean;
  // i18n fields
  language: string;
  original_language: string;
  title_si: string | null;
  title_en: string | null;
  summary_si: string | null;
  summary_en: string | null;
  is_backfill: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  source?: Source;
  tags?: Tag[];
}

export interface Story {
  id: string;
  title: string;
  summary: string | null;
  primary_topic: string | null;
  article_count: number;
  source_count: number;
  bias_distribution: {
    left: number;
    center: number;
    right: number;
  };
  image_url: string | null;
  first_seen_at: string;
  last_updated_at: string;
  is_active: boolean;
  is_trending: boolean;
  created_at: string;
  // i18n fields
  title_si: string | null;
  summary_si: string | null;
  // Blindspot fields
  blindspot_type: 'left' | 'right' | 'both' | 'none' | null;
  is_blindspot: boolean;
  blindspot_severity: number;
  // Briefing fields
  is_briefing_pick: boolean;
  briefing_date: string | null;
  // Joined data
  articles?: Article[];
  tags?: Tag[];
}

export interface DailyBriefing {
  id: string;
  briefing_date: string;
  story_count: number;
  article_count: number;
  total_reading_time_minutes: number;
  original_reporting_percentage: number;
  featured_story_id: string | null;
  summary: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  featured_story?: Story;
  stories?: Story[];
}

// Fetch functions
export async function getStories(limit = 20): Promise<Story[]> {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('is_active', true)
    .order('last_updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Error fetching stories', { error });
    return [];
  }

  return data || [];
}

export async function getStoryWithArticles(storyId: string): Promise<Story | null> {
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('*')
    .eq('id', storyId)
    .single();

  if (storyError || !story) {
    log.error('Error fetching story', { error: storyError });
    return null;
  }

  const { data: articles, error: articlesError } = await supabase
    .from('articles')
    .select(`
      *,
      source:sources(*)
    `)
    .eq('story_id', storyId)
    .order('published_at', { ascending: false });

  if (articlesError) {
    log.error('Error fetching articles', { error: articlesError });
    return { ...story, articles: [] };
  }

  return { ...story, articles: articles || [] };
}

export async function getLatestArticles(limit = 20): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select(`
      *,
      source:sources(id, name, slug, logo_url, bias_score)
    `)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Error fetching articles', { error });
    return [];
  }

  return data || [];
}

export async function getSources(): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    log.error('Error fetching sources', { error });
    return [];
  }

  return data || [];
}

export async function getSource(slug: string): Promise<Source | null> {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    log.error('Error fetching source', { error });
    return null;
  }

  return data;
}

export async function getArticlesBySource(sourceId: string, limit = 20): Promise<Article[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('source_id', sourceId)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Error fetching articles by source', { error });
    return [];
  }

  return data || [];
}

// Blindspot functions
export async function getBlindspotStories(limit = 10, type?: 'left' | 'right'): Promise<Story[]> {
  let query = supabase
    .from('stories')
    .select('*')
    .eq('is_blindspot', true)
    .eq('is_active', true)
    .order('last_updated_at', { ascending: false })
    .limit(limit);

  if (type) {
    query = query.eq('blindspot_type', type);
  }

  const { data, error } = await query;

  if (error) {
    log.error('Error fetching blindspot stories', { error });
    return [];
  }

  return data || [];
}

// Daily briefing functions
export async function getDailyBriefing(date?: string): Promise<DailyBriefing | null> {
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  const { data: briefing, error: briefingError } = await supabase
    .from('daily_briefings')
    .select('*')
    .eq('briefing_date', targetDate)
    .single();

  if (briefingError || !briefing) {
    return null;
  }

  // Get stories for this briefing
  const { data: briefingStories } = await supabase
    .from('briefing_stories')
    .select(`
      story_id,
      position,
      is_featured,
      story:stories(*)
    `)
    .eq('briefing_id', briefing.id)
    .order('position');

  const stories = briefingStories?.map(bs => bs.story).filter(Boolean) || [];
  const featuredStory = stories.find((_, i) => briefingStories?.[i]?.is_featured);

  return {
    ...briefing,
    stories,
    featured_story: featuredStory,
  };
}

export async function getRecentBriefings(limit = 7): Promise<DailyBriefing[]> {
  const { data, error } = await supabase
    .from('daily_briefings')
    .select('*')
    .eq('is_published', true)
    .order('briefing_date', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Error fetching briefings', { error });
    return [];
  }

  return data || [];
}

// ============================================
// Tag query functions
// ============================================

export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) {
    log.error('Error fetching tag', { error });
    return null;
  }

  return data;
}

export async function getPopularTags(limit = 20): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('is_active', true)
    .order('article_count', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Error fetching popular tags', { error });
    return [];
  }

  return data || [];
}

export async function getTagsByType(type: TagType, limit = 20): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('type', type)
    .eq('is_active', true)
    .order('article_count', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Error fetching tags by type', { error });
    return [];
  }

  return data || [];
}

export async function getArticlesByTag(tagSlug: string, limit = 20): Promise<Article[]> {
  // First get the tag ID
  const tag = await getTagBySlug(tagSlug);
  if (!tag) return [];

  // Get article IDs from junction table
  const { data: articleTags, error: junctionError } = await supabase
    .from('article_tags')
    .select('article_id')
    .eq('tag_id', tag.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (junctionError || !articleTags || articleTags.length === 0) return [];

  const articleIds = articleTags.map(at => at.article_id);

  const { data, error } = await supabase
    .from('articles')
    .select(`
      *,
      source:sources(id, name, slug, logo_url, bias_score)
    `)
    .in('id', articleIds)
    .order('published_at', { ascending: false });

  if (error) {
    log.error('Error fetching articles by tag', { error });
    return [];
  }

  return data || [];
}

export async function getStoriesByTag(tagSlug: string, limit = 10): Promise<Story[]> {
  const tag = await getTagBySlug(tagSlug);
  if (!tag) return [];

  const { data: storyTags, error: junctionError } = await supabase
    .from('story_tags')
    .select('story_id')
    .eq('tag_id', tag.id)
    .order('article_count', { ascending: false })
    .limit(limit);

  if (junctionError || !storyTags || storyTags.length === 0) return [];

  const storyIds = storyTags.map(st => st.story_id);

  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .in('id', storyIds)
    .eq('is_active', true)
    .order('last_updated_at', { ascending: false });

  if (error) {
    log.error('Error fetching stories by tag', { error });
    return [];
  }

  return data || [];
}

export async function getRelatedTags(tagId: string, limit = 10): Promise<Tag[]> {
  // Find articles that have this tag, then find other tags on those articles
  const { data: articleIds, error: atError } = await supabase
    .from('article_tags')
    .select('article_id')
    .eq('tag_id', tagId)
    .limit(100);

  if (atError || !articleIds || articleIds.length === 0) return [];

  const ids = articleIds.map(a => a.article_id);

  const { data: relatedTagIds, error: rtError } = await supabase
    .from('article_tags')
    .select('tag_id')
    .in('article_id', ids)
    .neq('tag_id', tagId);

  if (rtError || !relatedTagIds) return [];

  // Count frequency of each related tag
  const tagCounts: Record<string, number> = {};
  relatedTagIds.forEach(rt => {
    tagCounts[rt.tag_id] = (tagCounts[rt.tag_id] || 0) + 1;
  });

  // Get top N tag IDs
  const topTagIds = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => id);

  if (topTagIds.length === 0) return [];

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .in('id', topTagIds)
    .eq('is_active', true);

  if (error) {
    log.error('Error fetching related tags', { error });
    return [];
  }

  return data || [];
}

// ============================================
// Admin tag management functions
// ============================================

export async function createTag(tag: {
  name: string;
  name_si?: string;
  slug: string;
  type: TagType;
  description?: string;
  description_si?: string;
  created_by?: string;
}): Promise<Tag | null> {
  const { data, error } = await supabase
    .from('tags')
    .insert(tag)
    .select()
    .single();

  if (error) {
    log.error('Error creating tag', { error });
    return null;
  }

  return data;
}

export async function updateTag(id: string, updates: Partial<Tag>): Promise<Tag | null> {
  const { data, error } = await supabase
    .from('tags')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    log.error('Error updating tag', { error });
    return null;
  }

  return data;
}

export async function getAllTags(limit = 100): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('article_count', { ascending: false })
    .limit(limit);

  if (error) {
    log.error('Error fetching all tags', { error });
    return [];
  }

  return data || [];
}

export async function addTagToArticle(articleId: string, tagId: string): Promise<boolean> {
  const { error } = await supabase
    .from('article_tags')
    .insert({ article_id: articleId, tag_id: tagId, source: 'manual', confidence: 1.0 });

  if (error) {
    log.error('Error adding tag to article', { error });
    return false;
  }

  return true;
}

export async function removeTagFromArticle(articleId: string, tagId: string): Promise<boolean> {
  const { error } = await supabase
    .from('article_tags')
    .delete()
    .eq('article_id', articleId)
    .eq('tag_id', tagId);

  if (error) {
    log.error('Error removing tag from article', { error });
    return false;
  }

  return true;
}
