import { createClient } from '@supabase/supabase-js';

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
  created_at: string;
  updated_at: string;
  // Joined data
  source?: Source;
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
  // Blindspot fields
  blindspot_type: 'left' | 'right' | 'both' | 'none' | null;
  is_blindspot: boolean;
  blindspot_severity: number;
  // Briefing fields
  is_briefing_pick: boolean;
  briefing_date: string | null;
  // Joined data
  articles?: Article[];
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
    console.error('Error fetching stories:', error);
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
    console.error('Error fetching story:', storyError);
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
    console.error('Error fetching articles:', articlesError);
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
    console.error('Error fetching articles:', error);
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
    console.error('Error fetching sources:', error);
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
    console.error('Error fetching source:', error);
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
    console.error('Error fetching articles by source:', error);
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
    console.error('Error fetching blindspot stories:', error);
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
    console.error('Error fetching briefings:', error);
    return [];
  }

  return data || [];
}
