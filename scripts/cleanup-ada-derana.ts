/**
 * Clean up non-article URLs from Ada Derana records and add better URL filtering.
 * Usage: npx tsx scripts/cleanup-ada-derana.ts [--dry-run]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// URLs that are NOT articles — these are listing/category/system pages
const JUNK_URL_PATTERNS = [
  /\/index\.php$/,
  /\/hot-news\/?$/,
  /\/news_archive\.php/,
  /\/sports\.php$/,
  /\/sports-news\/?$/,
  /\/entertainment-news\/?$/,
  /\/more-entertainment-news\.php$/,
  /\/moretechnews\.php$/,
  /\/poll_results\.php/,
  /\/category\//,
  /\/tag\//,
  /\/author\//,
  /\/page\//,
  /\?mode=beauti/,  // old Ada Derana URL format for non-standard articles
  /\?mode=head/,    // old Ada Derana URL format
];

function isJunkUrl(url: string): boolean {
  return JUNK_URL_PATTERNS.some(p => p.test(url));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const adaEnId = '622a2e5f-806b-4695-9289-a9a9ff4973a0';
  const adaSiId = '73cdd796-1602-4dff-89a6-8a2b60c706e5';

  console.log(`${BOLD}Ada Derana Cleanup${RESET}${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Find all Ada Derana articles
  const { data: articles } = await supabase
    .from('articles')
    .select('id, url, title, published_at')
    .or(`source_id.eq.${adaEnId},source_id.eq.${adaSiId}`);

  if (!articles || articles.length === 0) {
    console.log('No Ada Derana articles found.');
    return;
  }

  console.log(`Total Ada Derana articles: ${articles.length}\n`);

  const junkArticles = articles.filter(a => isJunkUrl(a.url));
  console.log(`${YELLOW}Junk non-article records to remove: ${junkArticles.length}${RESET}`);

  for (const a of junkArticles) {
    console.log(`  ${RED}✗${RESET} ${a.url}`);
    console.log(`    Title: ${a.title?.slice(0, 60)}`);
  }

  if (!dryRun && junkArticles.length > 0) {
    const ids = junkArticles.map(a => a.id);
    // Delete article_tags first (FK constraint)
    await supabase.from('article_tags').delete().in('article_id', ids);
    // Delete articles
    const { error } = await supabase.from('articles').delete().in('id', ids);
    if (error) {
      console.log(`\n${RED}Delete failed: ${error.message}${RESET}`);
    } else {
      console.log(`\n${GREEN}✓ Deleted ${junkArticles.length} junk records${RESET}`);
    }
  }

  // Also check for epoch-zero date articles (January 1, 1970)
  const epochArticles = articles.filter(a => {
    if (!a.published_at) return false;
    const d = new Date(a.published_at);
    return d.getFullYear() < 2006;
  });

  if (epochArticles.length > 0) {
    console.log(`\n${YELLOW}Articles with impossible dates (pre-2006): ${epochArticles.length}${RESET}`);
    for (const a of epochArticles) {
      console.log(`  ${YELLOW}–${RESET} ${a.url} (date: ${a.published_at})`);
    }
  }

  // Report final counts
  const { count: totalEn } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', adaEnId);
  const { count: totalSi } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', adaSiId);
  const { count: withDateEn } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', adaEnId)
    .not('published_at', 'is', null);
  const { count: withDateSi } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', adaSiId)
    .not('published_at', 'is', null);

  console.log(`\n${BOLD}Final Counts:${RESET}`);
  console.log(`  Ada Derana EN: ${totalEn} total, ${withDateEn} with dates`);
  console.log(`  Ada Derana SI: ${totalSi} total, ${withDateSi} with dates`);
}

main().catch(console.error);
