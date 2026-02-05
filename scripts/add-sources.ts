/**
 * Add new sources to the database and fix existing source data issues.
 *
 * Usage:
 *   npx tsx scripts/add-sources.ts          # Add new sources + fix existing
 *   npx tsx scripts/add-sources.ts --dry    # Preview changes without applying
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
  process.env.SUPABASE_SERVICE_KEY!,
);

const isDry = process.argv.includes('--dry');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// New sources to add
// ---------------------------------------------------------------------------

interface NewSource {
  name: string;
  slug: string;
  url: string;
  rss_url: string | null;
  language: string;
  languages: string[];
  bias_score: number;
  factuality_score: number;
  description: string | null;
  country: string;
  scrape_config: Record<string, unknown>;
}

const NEW_SOURCES: NewSource[] = [
  // --- Sinhala sources ---
  {
    name: 'Gossip Lanka',
    slug: 'gossip-lanka',
    url: 'https://www.gossiplankahotnews.com',
    rss_url: 'https://www.gossiplankahotnews.com/feeds/posts/default?alt=rss',
    language: 'si',
    languages: ['si'],
    bias_score: -0.2,
    factuality_score: 35,
    description: 'Sinhala gossip and news site on Blogger platform',
    country: 'LK',
    scrape_config: { platform: 'blogger' },
  },
  {
    name: 'Lanka C News',
    slug: 'lanka-c-news',
    url: 'https://www.lankacnews.com',
    rss_url: 'https://www.lankacnews.com/feeds/posts/default?alt=rss',
    language: 'si',
    languages: ['si'],
    bias_score: -0.3,
    factuality_score: 40,
    description: 'Sinhala news site on Blogger platform',
    country: 'LK',
    scrape_config: { platform: 'blogger' },
  },
  {
    name: 'Lanka Truth Sinhala',
    slug: 'lanka-truth-si',
    url: 'https://lankatruth.com/si/',
    rss_url: 'https://lankatruth.com/si/?feed=rss2',
    language: 'si',
    languages: ['si'],
    bias_score: -0.4,
    factuality_score: 45,
    description: 'Lanka Truth Sinhala edition - opposition-leaning news',
    country: 'LK',
    scrape_config: { platform: 'wordpress' },
  },
  {
    name: 'අද (Ada.lk)',
    slug: 'ada-lk',
    url: 'http://www.ada.lk',
    rss_url: 'http://www.ada.lk/rss/latest_news/1',
    language: 'si',
    languages: ['si'],
    bias_score: 0.1,
    factuality_score: 60,
    description: 'Sinhala breaking news - Wijeya Newspapers Ltd',
    country: 'LK',
    scrape_config: { platform: 'custom', rss_categories: ['/rss/latest_news/1', '/rss/sport/6', '/rss/world_news/14'] },
  },
  {
    name: 'සිංහල News.lk',
    slug: 'news-lk-si',
    url: 'https://sinhala.news.lk',
    rss_url: null,
    language: 'si',
    languages: ['si'],
    bias_score: 0.8,
    factuality_score: 60,
    description: 'Government of Sri Lanka official Sinhala news portal',
    country: 'LK',
    scrape_config: { platform: 'joomla', method: 'playwright', cloudflare: true },
  },
  // --- English sources ---
  {
    name: 'Daily News',
    slug: 'daily-news',
    url: 'https://dailynews.lk',
    rss_url: null,
    language: 'en',
    languages: ['en'],
    bias_score: 0.5,
    factuality_score: 55,
    description: 'Daily News - Lake House / Associated Newspapers of Ceylon (state-owned)',
    country: 'LK',
    scrape_config: { platform: 'wordpress', method: 'playwright', cloudflare: true },
  },
  {
    name: 'The Morning',
    slug: 'the-morning',
    url: 'https://themorning.lk',
    rss_url: null,
    language: 'en',
    languages: ['en'],
    bias_score: 0.2,
    factuality_score: 60,
    description: 'The Morning - Derana Macroentertainment',
    country: 'LK',
    scrape_config: { platform: 'nextjs', method: 'playwright' },
  },
  {
    name: 'Sunday Times',
    slug: 'sunday-times',
    url: 'https://www.sundaytimes.lk',
    rss_url: null,
    language: 'en',
    languages: ['en'],
    bias_score: 0.0,
    factuality_score: 70,
    description: 'The Sunday Times Sri Lanka - Wijeya Newspapers Ltd',
    country: 'LK',
    scrape_config: { platform: 'wordpress', method: 'edition_rss', edition_sections: ['news', 'editorial', 'columns', 'sports', 'business-times'] },
  },
  {
    name: 'Ceylon Today',
    slug: 'ceylon-today',
    url: 'https://ceylontoday.lk',
    rss_url: null,
    language: 'en',
    languages: ['en'],
    bias_score: -0.1,
    factuality_score: 60,
    description: 'Ceylon Today - Ceylon Newspapers Pvt Ltd',
    country: 'LK',
    scrape_config: { platform: 'wordpress', method: 'wp_api', api_url: 'https://ceylontoday.lk/wp-json/wp/v2/posts' },
  },
  {
    name: 'Colombo Telegraph',
    slug: 'colombo-telegraph',
    url: 'https://www.colombotelegraph.com',
    rss_url: 'https://www.colombotelegraph.com/index.php/feed/',
    language: 'en',
    languages: ['en'],
    bias_score: -0.4,
    factuality_score: 55,
    description: 'Colombo Telegraph - independent news and opinion',
    country: 'LK',
    scrape_config: { platform: 'wordpress' },
  },
  {
    name: 'Asian Mirror',
    slug: 'asian-mirror',
    url: 'https://asianmirror.lk',
    rss_url: 'https://asianmirror.lk/feed/',
    language: 'en',
    languages: ['en'],
    bias_score: -0.2,
    factuality_score: 50,
    description: 'Asian Mirror - independent news, "Empowering Opinion"',
    country: 'LK',
    scrape_config: { platform: 'wordpress', wp_api: 'https://asianmirror.lk/wp-json/wp/v2/posts' },
  },
  {
    name: 'Sri Lanka Guardian',
    slug: 'sri-lanka-guardian',
    url: 'http://www.srilankaguardian.org',
    rss_url: 'http://www.srilankaguardian.org/feeds/posts/default?alt=rss',
    language: 'en',
    languages: ['en'],
    bias_score: -0.1,
    factuality_score: 50,
    description: 'Sri Lanka Guardian - news and views (Blogger, HTTP only due to broken SSL)',
    country: 'LK',
    scrape_config: { platform: 'blogger', http_only: true },
  },
];

// ---------------------------------------------------------------------------
// Fixes for existing sources
// ---------------------------------------------------------------------------

interface SourceFix {
  slug: string;
  updates: Record<string, unknown>;
  description: string;
}

const FIXES: SourceFix[] = [
  { slug: 'dinamina', updates: { languages: ['si'], scrape_config: { platform: 'wordpress', method: 'playwright', cloudflare: true } }, description: 'Fix languages: ["en"]->["si"], add Cloudflare config' },
  { slug: 'divaina', updates: { languages: ['si'] }, description: 'Fix languages: ["en"] -> ["si"]' },
  { slug: 'mawbima', updates: { languages: ['si'] }, description: 'Fix languages: ["en"] -> ["si"]' },
  { slug: 'silumina', updates: { languages: ['si'] }, description: 'Fix languages: ["en"] -> ["si"]' },
  {
    slug: 'newsfirst-en',
    updates: { scrape_config: { method: 'newsfirst_api', api_url: 'https://apienglish.newsfirst.lk/post/PostPagination' } },
    description: 'Add News 1st English API config',
  },
  {
    slug: 'newsfirst-si',
    updates: { scrape_config: { method: 'newsfirst_api', api_url: 'https://apisinhala.newsfirst.lk/post/PostPagination' } },
    description: 'Add News 1st Sinhala API config',
  },
  {
    slug: 'newsfirst-ta',
    updates: { scrape_config: { method: 'newsfirst_api', api_url: 'https://apitamil.newsfirst.lk/post/PostPagination' } },
    description: 'Add News 1st Tamil API config',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${BOLD}Source Management${RESET}${isDry ? ` ${YELLOW}(DRY RUN)${RESET}` : ''}\n`);

  // Step 1: Remove duplicate "News 1st" (slug: news1st, 0 articles)
  const { data: news1stDupe } = await supabase
    .from('sources')
    .select('id, name, slug, article_count')
    .eq('slug', 'news1st')
    .single();

  if (news1stDupe) {
    if (news1stDupe.article_count === 0) {
      console.log(`${RED}✗${RESET} Remove duplicate: "${news1stDupe.name}" (${news1stDupe.slug}, 0 articles)`);
      if (!isDry) {
        await supabase.from('sources').delete().eq('id', news1stDupe.id);
      }
    } else {
      console.log(`${YELLOW}!${RESET} Duplicate "news1st" has ${news1stDupe.article_count} articles - skipping deletion`);
    }
  }

  // Step 2: Fix existing sources
  console.log(`\n${BOLD}Fixing existing sources:${RESET}`);
  for (const fix of FIXES) {
    const { data: existing } = await supabase
      .from('sources')
      .select('id, name, slug')
      .eq('slug', fix.slug)
      .single();

    if (!existing) continue;

    console.log(`  ${GREEN}✓${RESET} ${existing.name} (${fix.slug}): ${fix.description}`);
    if (!isDry) {
      await supabase.from('sources').update(fix.updates).eq('id', existing.id);
    }
  }

  // Step 3: Add new sources
  console.log(`\n${BOLD}Adding new sources:${RESET}`);

  for (const src of NEW_SOURCES) {
    const { data: existing } = await supabase
      .from('sources')
      .select('id, slug')
      .eq('slug', src.slug)
      .single();

    if (existing) {
      console.log(`  ${DIM}– ${src.name} (${src.slug}) already exists, skipping${RESET}`);
      continue;
    }

    console.log(`  ${GREEN}+${RESET} ${src.name} (${src.slug}) — ${src.language}, RSS: ${src.rss_url ? 'yes' : 'no'}, bias: ${src.bias_score}`);

    if (!isDry) {
      const { error } = await supabase.from('sources').insert({
        name: src.name,
        slug: src.slug,
        url: src.url,
        rss_url: src.rss_url,
        language: src.language,
        languages: src.languages,
        bias_score: src.bias_score,
        factuality_score: src.factuality_score,
        description: src.description,
        country: src.country,
        is_active: true,
        scrape_config: src.scrape_config,
      });

      if (error) {
        console.log(`    ${RED}✗${RESET} Insert failed: ${error.message}`);
      }
    }
  }

  // Step 4: Summary
  const { data: allSources } = await supabase
    .from('sources')
    .select('slug, name, language, rss_url, is_active, article_count, scrape_config')
    .eq('is_active', true)
    .order('name');

  console.log(`\n${BOLD}Active sources summary:${RESET}`);
  console.log(`${'Source'.padEnd(30)} ${'Lang'.padEnd(5)} ${'Articles'.padEnd(10)} ${'Method'}`);
  console.log('─'.repeat(70));

  let totalArticles = 0;
  for (const s of allSources || []) {
    const cfg = s.scrape_config as Record<string, unknown> | null;
    const method = (cfg?.method as string) || (s.rss_url ? 'rss' : 'listing_scrape');
    console.log(
      `${s.name.slice(0, 29).padEnd(30)} ${s.language.padEnd(5)} ${String(s.article_count).padEnd(10)} ${method}`
    );
    totalArticles += s.article_count || 0;
  }
  console.log('─'.repeat(70));
  console.log(`Total: ${allSources?.length || 0} sources, ${totalArticles} articles\n`);
}

main().catch(console.error);
