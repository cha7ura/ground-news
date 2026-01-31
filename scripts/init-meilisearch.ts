/**
 * Initialize Meilisearch indexes with settings.
 * Usage: npx tsx scripts/init-meilisearch.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MeiliSearch } from 'meilisearch';

// Load env.local manually (no @/ alias available in standalone tsx)
const envPath = resolve(__dirname, '..', 'env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // env.local not found, use existing env
}

const host = process.env.MEILISEARCH_URL || 'http://localhost:7700';
const apiKey = process.env.MEILISEARCH_MASTER_KEY || 'masterKey';

const INDEXES = {
  articles: 'gn_articles',
  stories: 'gn_stories',
  sources: 'gn_sources',
} as const;

async function main() {
  const client = new MeiliSearch({ host, apiKey });

  // Verify connectivity
  try {
    const health = await client.health();
    console.log(`\x1b[32m✓\x1b[0m Meilisearch is ${health.status} at ${host}`);
  } catch (err) {
    console.error(`\x1b[31m✗\x1b[0m Cannot connect to Meilisearch at ${host}`);
    process.exit(1);
  }

  // Sources index
  console.log(`  Creating index: ${INDEXES.sources}`);
  const sourcesIndex = client.index(INDEXES.sources);
  await sourcesIndex.updateSettings({
    searchableAttributes: ['name', 'description'],
    filterableAttributes: ['slug', 'bias_score', 'is_active', 'country', 'language'],
    sortableAttributes: ['name', 'article_count', 'factuality_score'],
    displayedAttributes: [
      'id', 'name', 'slug', 'url', 'logo_url', 'favicon_url',
      'bias_score', 'factuality_score', 'description',
      'article_count', 'is_active',
    ],
  });

  // Articles index
  console.log(`  Creating index: ${INDEXES.articles}`);
  const articlesIndex = client.index(INDEXES.articles);
  await articlesIndex.updateSettings({
    searchableAttributes: ['title', 'content', 'summary', 'excerpt'],
    filterableAttributes: [
      'source_id', 'story_id', 'topics',
      'ai_bias_score', 'ai_sentiment',
      'published_at', 'is_processed',
    ],
    sortableAttributes: ['published_at', 'ai_bias_score', 'created_at'],
    displayedAttributes: [
      'id', 'source_id', 'story_id', 'url', 'title', 'summary', 'excerpt',
      'image_url', 'author', 'published_at', 'topics',
      'ai_bias_score', 'ai_sentiment',
    ],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
    },
  });

  // Stories index
  console.log(`  Creating index: ${INDEXES.stories}`);
  const storiesIndex = client.index(INDEXES.stories);
  await storiesIndex.updateSettings({
    searchableAttributes: ['title', 'summary', 'primary_topic'],
    filterableAttributes: [
      'primary_topic', 'source_count', 'article_count',
      'is_trending', 'is_active',
      'first_seen_at', 'last_updated_at',
    ],
    sortableAttributes: ['last_updated_at', 'first_seen_at', 'article_count', 'source_count'],
    displayedAttributes: [
      'id', 'title', 'summary', 'primary_topic', 'image_url',
      'article_count', 'source_count', 'bias_distribution',
      'first_seen_at', 'last_updated_at', 'is_trending',
    ],
  });

  console.log(`\x1b[32m✓\x1b[0m All 3 indexes initialized`);
}

main().catch((err) => {
  console.error('Failed to initialize Meilisearch:', err);
  process.exit(1);
});
