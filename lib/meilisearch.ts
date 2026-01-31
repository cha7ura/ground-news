import { MeiliSearch } from 'meilisearch';
import { createLogger } from '@/lib/logger';

const log = createLogger('meilisearch');

const meilisearchUrl = process.env.MEILISEARCH_URL || process.env.MEILISEARCH_HOST || 'http://localhost:7700';
const meilisearchKey = process.env.MEILISEARCH_MASTER_KEY || 'masterKey';

export const meilisearch = new MeiliSearch({
  host: meilisearchUrl,
  apiKey: meilisearchKey,
});

// Index names for Ground News
export const INDEXES = {
  articles: 'gn_articles',
  stories: 'gn_stories',
  sources: 'gn_sources',
} as const;

// Bias category helper
export type BiasCategory = 'left' | 'center' | 'right';

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

// Initialize indexes with settings
export async function initializeIndexes() {
  const client = meilisearch;

  // Sources index
  const sourcesIndex = client.index(INDEXES.sources);
  await sourcesIndex.updateSettings({
    searchableAttributes: ['name', 'description'],
    filterableAttributes: ['slug', 'bias_score', 'is_active', 'country', 'language'],
    sortableAttributes: ['name', 'article_count', 'factuality_score'],
    displayedAttributes: [
      'id', 'name', 'slug', 'url', 'logo_url', 'favicon_url',
      'bias_score', 'factuality_score', 'description',
      'article_count', 'is_active'
    ],
  });

  // Articles index
  const articlesIndex = client.index(INDEXES.articles);
  await articlesIndex.updateSettings({
    searchableAttributes: ['title', 'content', 'summary', 'excerpt'],
    filterableAttributes: [
      'source_id', 
      'story_id',
      'topics', 
      'ai_bias_score', 
      'ai_sentiment',
      'published_at',
      'is_processed'
    ],
    sortableAttributes: ['published_at', 'ai_bias_score', 'created_at'],
    displayedAttributes: [
      'id', 'source_id', 'story_id', 'url', 'title', 'summary', 'excerpt',
      'image_url', 'author', 'published_at', 'topics',
      'ai_bias_score', 'ai_sentiment'
    ],
    // Enable typo tolerance for better search
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: {
        oneTypo: 4,
        twoTypos: 8,
      },
    },
  });

  // Stories index
  const storiesIndex = client.index(INDEXES.stories);
  await storiesIndex.updateSettings({
    searchableAttributes: ['title', 'summary', 'primary_topic'],
    filterableAttributes: [
      'primary_topic',
      'source_count',
      'article_count',
      'is_trending',
      'is_active',
      'first_seen_at',
      'last_updated_at'
    ],
    sortableAttributes: ['last_updated_at', 'first_seen_at', 'article_count', 'source_count'],
    displayedAttributes: [
      'id', 'title', 'summary', 'primary_topic', 'image_url',
      'article_count', 'source_count', 'bias_distribution',
      'first_seen_at', 'last_updated_at', 'is_trending'
    ],
  });

  log.info('Meilisearch indexes initialized');
}

// Article types
export interface ArticleDocument {
  id: string;
  source_id: string;
  story_id: string | null;
  url: string;
  title: string;
  summary: string | null;
  excerpt: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string;
  topics: string[];
  ai_bias_score: number | null;
  ai_sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
}

export interface StoryDocument {
  id: string;
  title: string;
  summary: string | null;
  primary_topic: string | null;
  image_url: string | null;
  article_count: number;
  source_count: number;
  bias_distribution: {
    left: number;
    center: number;
    right: number;
  };
  first_seen_at: string;
  last_updated_at: string;
  is_trending: boolean;
}

export interface SourceDocument {
  id: string;
  name: string;
  slug: string;
  url: string;
  logo_url: string | null;
  favicon_url: string | null;
  bias_score: number;
  factuality_score: number;
  description: string | null;
  article_count: number;
  is_active: boolean;
}

/**
 * Search articles with filtering
 */
export async function searchArticles(
  query: string,
  options: {
    sourceId?: string;
    storyId?: string;
    topics?: string[];
    biasRange?: { min: number; max: number };
    sentiment?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const filters: string[] = [];
  
  if (options.sourceId) {
    filters.push(`source_id = "${options.sourceId}"`);
  }
  if (options.storyId) {
    filters.push(`story_id = "${options.storyId}"`);
  }
  if (options.topics && options.topics.length > 0) {
    const topicFilters = options.topics.map(t => `topics = "${t}"`);
    filters.push(`(${topicFilters.join(' OR ')})`);
  }
  if (options.biasRange) {
    filters.push(`ai_bias_score >= ${options.biasRange.min}`);
    filters.push(`ai_bias_score <= ${options.biasRange.max}`);
  }
  if (options.sentiment) {
    filters.push(`ai_sentiment = "${options.sentiment}"`);
  }

  return meilisearch.index(INDEXES.articles).search<ArticleDocument>(query, {
    limit: options.limit || 20,
    offset: options.offset || 0,
    filter: filters.length > 0 ? filters.join(' AND ') : undefined,
    sort: ['published_at:desc'],
  });
}

/**
 * Search stories with filtering
 */
export async function searchStories(
  query: string,
  options: {
    topic?: string;
    minSources?: number;
    isTrending?: boolean;
    limit?: number;
    offset?: number;
  } = {}
) {
  const filters: string[] = [];
  
  if (options.topic) {
    filters.push(`primary_topic = "${options.topic}"`);
  }
  if (options.minSources) {
    filters.push(`source_count >= ${options.minSources}`);
  }
  if (options.isTrending !== undefined) {
    filters.push(`is_trending = ${options.isTrending}`);
  }

  return meilisearch.index(INDEXES.stories).search<StoryDocument>(query, {
    limit: options.limit || 20,
    offset: options.offset || 0,
    filter: filters.length > 0 ? filters.join(' AND ') : undefined,
    sort: ['last_updated_at:desc'],
  });
}

/**
 * Get trending stories (multi-source coverage)
 */
export async function getTrendingStories(limit: number = 10) {
  return meilisearch.index(INDEXES.stories).search<StoryDocument>('', {
    limit,
    filter: 'source_count >= 2 AND is_active = true',
    sort: ['last_updated_at:desc', 'article_count:desc'],
  });
}

/**
 * Get latest articles from all sources
 */
export async function getLatestArticles(limit: number = 20) {
  return meilisearch.index(INDEXES.articles).search<ArticleDocument>('', {
    limit,
    sort: ['published_at:desc'],
  });
}

/**
 * Get articles by topic
 */
export async function getArticlesByTopic(topic: string, limit: number = 20) {
  return meilisearch.index(INDEXES.articles).search<ArticleDocument>('', {
    limit,
    filter: `topics = "${topic}"`,
    sort: ['published_at:desc'],
  });
}

/**
 * Get all sources
 */
export async function getSources() {
  return meilisearch.index(INDEXES.sources).search<SourceDocument>('', {
    limit: 100,
    filter: 'is_active = true',
    sort: ['name:asc'],
  });
}

/**
 * Index an article
 */
export async function indexArticle(article: ArticleDocument) {
  return meilisearch.index(INDEXES.articles).addDocuments([article]);
}

/**
 * Index a story
 */
export async function indexStory(story: StoryDocument) {
  return meilisearch.index(INDEXES.stories).addDocuments([story]);
}

/**
 * Index a source
 */
export async function indexSource(source: SourceDocument) {
  return meilisearch.index(INDEXES.sources).addDocuments([source]);
}

/**
 * Bulk index articles
 */
export async function bulkIndexArticles(articles: ArticleDocument[]) {
  return meilisearch.index(INDEXES.articles).addDocuments(articles);
}

/**
 * Bulk index stories
 */
export async function bulkIndexStories(stories: StoryDocument[]) {
  return meilisearch.index(INDEXES.stories).addDocuments(stories);
}
