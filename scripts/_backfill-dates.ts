/**
 * Backfill published_at dates for articles missing them.
 *
 * Strategy per source:
 *   1. divaina, newswire         — re-scrape via Firecrawl, use metadata.publishedTime
 *   2. the-island, sri-lanka-mirror — re-scrape via Firecrawl, use metadata.dateModified
 *   3. newsfirst-en/si/ta        — extract date from URL pattern /YYYY/MM/DD/
 *   4. sunday-observer, news19, daily-mirror — skip non-article URLs (images, feeds, /print)
 *   5. lankadeepa, daily-ft, ada-derana — no date available in metadata or URL
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envContent = readFileSync(resolve(__dirname, '..', 'env.local'), 'utf-8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  const v = t.slice(eq + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';
const CONCURRENCY = 3;
const DELAY_MS = 500;

let updated = 0;
let skipped = 0;
let failed = 0;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeMetadata(url: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json() as any;
    return data.data?.metadata || {};
  } catch {
    return {};
  }
}

function extractDateFromUrl(url: string): string | null {
  const m = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = parseInt(y);
  if (year < 2020 || year > 2030) return null;
  return `${y}-${mo}-${d}T00:00:00+05:30`;
}

function parseFlexDate(dateStr: string): string | null {
  // Handle formats like "2025-12-01 8:23 pm" or ISO strings
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    if (d.getFullYear() < 2020 || d.getFullYear() > 2030) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

async function updateDate(articleId: string, publishedAt: string) {
  const { error } = await sb
    .from('articles')
    .update({ published_at: publishedAt })
    .eq('id', articleId);
  if (error) {
    console.log(`    ✗ DB update failed: ${error.message}`);
    failed++;
  } else {
    updated++;
  }
}

// === Strategy: Extract from Firecrawl metadata (publishedTime) ===
async function fixViaPublishedTime(slug: string) {
  const { data: source } = await sb.from('sources').select('id').eq('slug', slug).single();
  if (!source) { console.log(`  Source ${slug} not found`); return; }

  const { data: articles } = await sb
    .from('articles')
    .select('id, url')
    .eq('source_id', source.id)
    .is('published_at', null)
    .limit(1000);

  if (!articles || articles.length === 0) {
    console.log(`  ${slug}: no articles missing dates`);
    return;
  }
  console.log(`  ${slug}: ${articles.length} articles to fix via metadata.publishedTime`);

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const meta = await scrapeMetadata(a.url);
    const pt = meta.publishedTime || meta['article:published_time'];
    if (pt) {
      const parsed = parseFlexDate(pt);
      if (parsed) {
        await updateDate(a.id, parsed);
        console.log(`    ✓ [${i + 1}/${articles.length}] ${parsed.slice(0, 10)}`);
      } else {
        console.log(`    ✗ [${i + 1}/${articles.length}] unparseable: ${pt}`);
        skipped++;
      }
    } else {
      console.log(`    ✗ [${i + 1}/${articles.length}] no publishedTime`);
      skipped++;
    }
    await sleep(DELAY_MS);
  }
}

// === Strategy: Extract from Firecrawl metadata (dateModified) ===
async function fixViaDateModified(slug: string) {
  const { data: source } = await sb.from('sources').select('id').eq('slug', slug).single();
  if (!source) { console.log(`  Source ${slug} not found`); return; }

  const { data: articles } = await sb
    .from('articles')
    .select('id, url')
    .eq('source_id', source.id)
    .is('published_at', null)
    .limit(1000);

  if (!articles || articles.length === 0) {
    console.log(`  ${slug}: no articles missing dates`);
    return;
  }
  console.log(`  ${slug}: ${articles.length} articles to fix via metadata.dateModified`);

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const meta = await scrapeMetadata(a.url);
    const dm = meta.dateModified || meta.publishedTime || meta['article:published_time'];
    if (dm) {
      const parsed = parseFlexDate(dm);
      if (parsed) {
        await updateDate(a.id, parsed);
        console.log(`    ✓ [${i + 1}/${articles.length}] ${parsed.slice(0, 10)}`);
      } else {
        console.log(`    ✗ [${i + 1}/${articles.length}] unparseable: ${dm}`);
        skipped++;
      }
    } else {
      console.log(`    ✗ [${i + 1}/${articles.length}] no dateModified`);
      skipped++;
    }
    await sleep(DELAY_MS);
  }
}

// === Strategy: Extract date from URL pattern ===
async function fixViaUrlDate(slug: string) {
  const { data: source } = await sb.from('sources').select('id').eq('slug', slug).single();
  if (!source) { console.log(`  Source ${slug} not found`); return; }

  const { data: articles } = await sb
    .from('articles')
    .select('id, url')
    .eq('source_id', source.id)
    .is('published_at', null)
    .limit(1000);

  if (!articles || articles.length === 0) {
    console.log(`  ${slug}: no articles missing dates`);
    return;
  }
  console.log(`  ${slug}: ${articles.length} articles to fix via URL date pattern`);

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const dateStr = extractDateFromUrl(a.url);
    if (dateStr) {
      await updateDate(a.id, dateStr);
      console.log(`    ✓ [${i + 1}/${articles.length}] ${dateStr.slice(0, 10)}`);
    } else {
      console.log(`    ✗ [${i + 1}/${articles.length}] no date in URL: ${a.url}`);
      skipped++;
    }
  }
}

(async () => {
  console.log('=== Date Backfill ===\n');

  // 1. Sources with publishedTime in Firecrawl metadata
  console.log('--- publishedTime sources ---');
  await fixViaPublishedTime('divaina');
  await fixViaPublishedTime('newswire');

  // 2. Sources with dateModified in Firecrawl metadata
  console.log('\n--- dateModified sources ---');
  await fixViaDateModified('the-island');
  await fixViaDateModified('sri-lanka-mirror');

  // 3. Sources with date in URL
  console.log('\n--- URL date sources ---');
  await fixViaUrlDate('newsfirst-en');
  await fixViaUrlDate('newsfirst-si');
  await fixViaUrlDate('newsfirst-ta');
  await fixViaUrlDate('newswire'); // also has date in URL as fallback

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated} | Skipped: ${skipped} | Failed: ${failed}`);
})();
