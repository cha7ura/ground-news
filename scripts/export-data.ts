/**
 * Export all database data to JSON seed files for deployment.
 *
 * Usage: npx tsx scripts/export-data.ts
 *
 * Exports to: supabase/seed/
 *   - sources.json
 *   - articles.json
 *   - stories.json
 *   - story_articles.json
 *   - tags.json          (if any)
 *   - article_tags.json  (if any)
 *   - story_tags.json    (if any)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Load env.local
// ---------------------------------------------------------------------------
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
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SEED_DIR = resolve(__dirname, '..', 'supabase', 'seed');
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function exportTable(table: string, select = '*', order?: { column: string; ascending: boolean }) {
  let query = supabase.from(table).select(select);
  if (order) query = query.order(order.column, { ascending: order.ascending });

  const { data, error } = await query;
  if (error) {
    console.error(`  ${YELLOW}✗${RESET} ${table}: ${error.message}`);
    return [];
  }

  const rows = data || [];
  if (rows.length === 0) {
    console.log(`  ${DIM}–${RESET} ${table}: 0 rows (skipped)`);
    return [];
  }

  const filePath = resolve(SEED_DIR, `${table}.json`);
  writeFileSync(filePath, JSON.stringify(rows, null, 2));
  console.log(`  ${GREEN}✓${RESET} ${table}: ${rows.length} rows → seed/${table}.json`);
  return rows;
}

async function main() {
  mkdirSync(SEED_DIR, { recursive: true });

  console.log(`\n${GREEN}▸${RESET} Exporting database to supabase/seed/\n`);

  // Export in dependency order (sources first, then articles, etc.)
  await exportTable('sources', '*', { column: 'name', ascending: true });

  // Articles: exclude the raw embedding vector to keep file size manageable
  // Embeddings can be regenerated from content
  const { data: articles } = await supabase
    .from('articles')
    .select('id, source_id, url, title, content, summary, excerpt, image_url, author, published_at, scraped_at, topics, ai_bias_score, ai_sentiment, ai_enriched_at, story_id, is_processed, error_message, language, original_language, title_si, title_en, summary_si, summary_en, is_backfill, created_at, updated_at')
    .order('published_at', { ascending: false });

  if (articles && articles.length > 0) {
    writeFileSync(
      resolve(SEED_DIR, 'articles.json'),
      JSON.stringify(articles, null, 2)
    );
    console.log(`  ${GREEN}✓${RESET} articles: ${articles.length} rows → seed/articles.json (without embeddings)`);
  }

  // Also export articles with embeddings in a separate file
  const { data: embeddingRows } = await supabase
    .from('articles')
    .select('id, embedding')
    .not('embedding', 'is', null);

  if (embeddingRows && embeddingRows.length > 0) {
    writeFileSync(
      resolve(SEED_DIR, 'article_embeddings.json'),
      JSON.stringify(embeddingRows, null, 2)
    );
    console.log(`  ${GREEN}✓${RESET} article_embeddings: ${embeddingRows.length} rows → seed/article_embeddings.json`);
  }

  await exportTable('stories', '*', { column: 'created_at', ascending: false });
  await exportTable('story_articles', '*');
  await exportTable('tags', '*', { column: 'article_count', ascending: false });
  await exportTable('article_tags', '*');
  await exportTable('story_tags', '*');
  await exportTable('daily_briefings', '*');
  await exportTable('briefing_stories', '*');

  // Summary
  console.log(`\n${GREEN}▸${RESET} Export complete → supabase/seed/`);
  console.log(`${DIM}  Import with: npx tsx scripts/import-data.ts${RESET}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
