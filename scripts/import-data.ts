/**
 * Import seed data from JSON files into Supabase.
 * Used when deploying to a new environment (e.g. Railway).
 *
 * Usage: npx tsx scripts/import-data.ts [--skip-embeddings] [--dry-run]
 *
 * Reads from: supabase/seed/
 *   - sources.json          → sources table
 *   - articles.json         → articles table (without embeddings)
 *   - article_embeddings.json → updates articles with embedding vectors
 *   - stories.json          → stories table
 *   - story_articles.json   → story_articles table
 *   - tags.json             → tags table
 *   - article_tags.json     → article_tags table
 *   - story_tags.json       → story_tags table
 *
 * Note: Tables are upserted in dependency order. Existing rows with the
 * same primary key are skipped (not overwritten).
 */

import { readFileSync, existsSync } from 'fs';
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
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function loadJSON<T>(filename: string): T[] {
  const filePath = resolve(SEED_DIR, filename);
  if (!existsSync(filePath)) return [];
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T[];
}

// Upsert in batches to avoid payload limits
async function upsertBatch(
  table: string,
  rows: Record<string, unknown>[],
  conflictColumn = 'id',
  batchSize = 50,
  dryRun = false
): Promise<{ inserted: number; errors: number }> {
  if (rows.length === 0) {
    console.log(`  ${DIM}–${RESET} ${table}: no seed data`);
    return { inserted: 0, errors: 0 };
  }

  if (dryRun) {
    console.log(`  ${YELLOW}▸${RESET} ${table}: ${rows.length} rows (dry run)`);
    return { inserted: rows.length, errors: 0 };
  }

  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictColumn, ignoreDuplicates: true });

    if (error) {
      console.error(`  ${RED}✗${RESET} ${table} batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  console.log(`  ${GREEN}✓${RESET} ${table}: ${inserted} rows imported`);
  return { inserted, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const skipEmbeddings = args.includes('--skip-embeddings');
  const dryRun = args.includes('--dry-run');

  console.log(`\n${GREEN}▸${RESET} Importing seed data from supabase/seed/`);
  if (dryRun) console.log(`  ${YELLOW}(dry run — no data will be written)${RESET}`);
  if (skipEmbeddings) console.log(`  ${DIM}(skipping embeddings)${RESET}`);
  console.log();

  // 1. Sources (no foreign keys)
  const sources = loadJSON<Record<string, unknown>>('sources.json');
  await upsertBatch('sources', sources, 'id', 50, dryRun);

  // 2. Stories (no foreign keys to articles)
  const stories = loadJSON<Record<string, unknown>>('stories.json');
  await upsertBatch('stories', stories, 'id', 50, dryRun);

  // 3. Articles (references sources and stories)
  const articles = loadJSON<Record<string, unknown>>('articles.json');
  await upsertBatch('articles', articles, 'id', 50, dryRun);

  // 4. Article embeddings (updates existing articles)
  if (!skipEmbeddings) {
    const embeddings = loadJSON<{ id: string; embedding: string }>('article_embeddings.json');
    if (embeddings.length > 0 && !dryRun) {
      console.log(`  ${DIM}Importing ${embeddings.length} embeddings...${RESET}`);
      let emb_ok = 0;
      let emb_err = 0;
      for (const row of embeddings) {
        const { error } = await supabase
          .from('articles')
          .update({ embedding: row.embedding })
          .eq('id', row.id);
        if (error) emb_err++;
        else emb_ok++;
      }
      console.log(`  ${GREEN}✓${RESET} article_embeddings: ${emb_ok} updated${emb_err > 0 ? `, ${emb_err} errors` : ''}`);
    } else if (embeddings.length > 0) {
      console.log(`  ${YELLOW}▸${RESET} article_embeddings: ${embeddings.length} rows (dry run)`);
    } else {
      console.log(`  ${DIM}–${RESET} article_embeddings: no seed data`);
    }
  }

  // 5. Story articles junction
  const storyArticles = loadJSON<Record<string, unknown>>('story_articles.json');
  await upsertBatch('story_articles', storyArticles, 'id', 50, dryRun);

  // 6. Tags
  const tags = loadJSON<Record<string, unknown>>('tags.json');
  await upsertBatch('tags', tags, 'id', 50, dryRun);

  // 7. Article tags junction
  const articleTags = loadJSON<Record<string, unknown>>('article_tags.json');
  await upsertBatch('article_tags', articleTags, 'id', 50, dryRun);

  // 8. Story tags junction
  const storyTags = loadJSON<Record<string, unknown>>('story_tags.json');
  await upsertBatch('story_tags', storyTags, 'id', 50, dryRun);

  // 9. Daily briefings
  const briefings = loadJSON<Record<string, unknown>>('daily_briefings.json');
  await upsertBatch('daily_briefings', briefings, 'id', 50, dryRun);

  // 10. Briefing stories junction
  const briefingStories = loadJSON<Record<string, unknown>>('briefing_stories.json');
  await upsertBatch('briefing_stories', briefingStories, 'id', 50, dryRun);

  console.log(`\n${GREEN}▸${RESET} Import complete\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
