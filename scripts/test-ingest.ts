/**
 * Test ingestion pipeline: RSS fetch → Firecrawl scrape → Supabase insert
 *
 * Usage: npx tsx scripts/test-ingest.ts [--source ada-derana-en] [--limit 3]
 */

import { readFileSync } from 'fs';
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';

const supabase = createClient(supabaseUrl, supabaseKey);

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// RSS parser (handles ISO-8859-1 from Ada Derana)
// ---------------------------------------------------------------------------

interface RSSItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
  imageUrl: string | null;
}

async function fetchRSS(rssUrl: string): Promise<RSSItem[]> {
  const res = await fetch(rssUrl);
  const buffer = await res.arrayBuffer();

  // Try UTF-8 first, fall back to latin1
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('iso-8859-1').decode(buffer);
  }

  // Simple XML parsing (no external deps)
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(text)) !== null) {
    const xml = match[1];
    const getTag = (tag: string): string | null => {
      const m = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };

    const title = getTag('title') || 'Untitled';
    const link = getTag('link') || getTag('guid') || '';
    const pubDate = getTag('pubDate');
    const description = getTag('description');

    // Extract image from description CDATA
    let imageUrl: string | null = null;
    if (description) {
      const imgMatch = description.match(/src=['"](https?:\/\/[^'"]+)['"]/i);
      if (imgMatch) imageUrl = imgMatch[1];
    }

    if (link) {
      items.push({ title, link, pubDate, description, imageUrl });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Firecrawl scrape
// ---------------------------------------------------------------------------

async function scrapeArticle(url: string): Promise<{ markdown: string; title: string | null } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      success: boolean;
      data?: { markdown?: string; metadata?: { title?: string } };
    };

    if (!data.success || !data.data?.markdown) return null;

    return {
      markdown: data.data.markdown,
      title: data.data.metadata?.title || null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse args
  const args = process.argv.slice(2);
  let sourceSlug = 'ada-derana-en';
  let limit = 3;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) sourceSlug = args[++i];
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
  }

  console.log(`\n${GREEN}▸${RESET} Test Ingestion Pipeline`);
  console.log(`  Source: ${sourceSlug}, Limit: ${limit}\n`);

  // 1. Get source from Supabase
  const { data: source, error: srcErr } = await supabase
    .from('sources')
    .select('*')
    .eq('slug', sourceSlug)
    .single();

  if (srcErr || !source) {
    console.error(`${RED}✗${RESET} Source "${sourceSlug}" not found`);
    process.exit(1);
  }

  if (!source.rss_url) {
    console.error(`${RED}✗${RESET} Source "${source.name}" has no RSS URL`);
    process.exit(1);
  }

  console.log(`${GREEN}✓${RESET} Source: ${source.name} (${source.language})`);
  console.log(`  RSS: ${source.rss_url}\n`);

  // 2. Fetch RSS feed
  console.log(`${DIM}Fetching RSS...${RESET}`);
  const rssItems = await fetchRSS(source.rss_url);
  console.log(`${GREEN}✓${RESET} Found ${rssItems.length} RSS items\n`);

  if (rssItems.length === 0) {
    console.error(`${RED}✗${RESET} No items in RSS feed`);
    process.exit(1);
  }

  // 3. Get existing article URLs to deduplicate
  const urls = rssItems.slice(0, limit).map(i => i.link);
  const { data: existing } = await supabase
    .from('articles')
    .select('url')
    .in('url', urls);

  const existingUrls = new Set((existing || []).map(a => a.url));

  // 4. Process each item
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of rssItems.slice(0, limit)) {
    if (existingUrls.has(item.link)) {
      console.log(`${YELLOW}–${RESET} ${item.title.slice(0, 60)}... ${DIM}(already exists)${RESET}`);
      skipped++;
      continue;
    }

    console.log(`${DIM}Scraping: ${item.title.slice(0, 60)}...${RESET}`);

    const scraped = await scrapeArticle(item.link);

    if (!scraped || scraped.markdown.length < 100) {
      console.log(`${RED}✗${RESET} ${item.title.slice(0, 60)}... ${DIM}(scrape failed or too short)${RESET}`);
      failed++;
      continue;
    }

    // Parse pubDate
    let publishedAt: string | null = null;
    if (item.pubDate) {
      try {
        publishedAt = new Date(item.pubDate).toISOString();
      } catch {}
    }

    // Insert article
    const { error: insertErr } = await supabase.from('articles').insert({
      source_id: source.id,
      url: item.link,
      title: item.title,
      content: scraped.markdown,
      excerpt: item.description?.replace(/<[^>]*>/g, '').slice(0, 300) || null,
      image_url: item.imageUrl,
      published_at: publishedAt,
      language: source.language,
      original_language: source.language,
      is_processed: false,
    });

    if (insertErr) {
      console.log(`${RED}✗${RESET} ${item.title.slice(0, 60)}... ${DIM}(insert error: ${insertErr.message})${RESET}`);
      failed++;
    } else {
      console.log(`${GREEN}✓${RESET} ${item.title.slice(0, 60)}... ${DIM}(${scraped.markdown.length} chars)${RESET}`);
      inserted++;
    }

    // Rate limit between scrapes
    await new Promise(r => setTimeout(r, 2000));
  }

  // Summary
  console.log(`\n${GREEN}▸${RESET} Results: ${inserted} inserted, ${skipped} skipped, ${failed} failed`);

  // Show what's in the DB now
  const { count } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true });

  console.log(`  Total articles in database: ${count || 0}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
