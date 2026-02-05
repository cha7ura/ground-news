/**
 * Backfill Ada Derana articles (English + Sinhala) from paginated archive pages.
 *
 * Ada Derana does NOT have og: meta tags, JSON-LD, or author attribution.
 * Dates are extracted from page text ("February 4, 2026 02:39 pm").
 * The Sinhala RSS feed is broken (PHP fatal error), so scraping is the only option.
 *
 * Usage:
 *   npx tsx scripts/backfill-adaderana.ts                          # backfill both en + si
 *   npx tsx scripts/backfill-adaderana.ts --source ada-derana-en    # English only
 *   npx tsx scripts/backfill-adaderana.ts --source ada-derana-si    # Sinhala only
 *   npx tsx scripts/backfill-adaderana.ts --pages 10               # crawl 10 listing pages (default: 5)
 *   npx tsx scripts/backfill-adaderana.ts --limit 100              # max 100 articles per source
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load env.local
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
const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}
function log(msg: string) {
  console.log(`${DIM}[${timestamp()}]${RESET} ${msg}`);
}

// ---------------------------------------------------------------------------
// Ada Derana source configs
// ---------------------------------------------------------------------------

interface AdaDeranaSrc {
  slug: string;
  listingUrl: string;      // hot-news pagination base
  articleUrlPattern: RegExp; // regex to match article links in listing pages
  domain: string;
}

const ADA_DERANA_SOURCES: AdaDeranaSrc[] = [
  {
    slug: 'ada-derana-en',
    listingUrl: 'https://www.adaderana.lk/hot-news/',
    articleUrlPattern: /https?:\/\/(?:www\.)?adaderana\.lk\/news(?:\.php\?nid=|\/)\d+/g,
    domain: 'adaderana.lk',
  },
  {
    slug: 'ada-derana-si',
    listingUrl: 'https://sinhala.adaderana.lk/',  // hot-news/ returns 404 for Sinhala
    articleUrlPattern: /https?:\/\/sinhala\.adaderana\.lk\/news\/\d+/g,
    domain: 'sinhala.adaderana.lk',
  },
];

// ---------------------------------------------------------------------------
// Date extraction from page text (Ada Derana has no og: meta tags)
// ---------------------------------------------------------------------------

function extractDateFromText(text: string): string | null {
  // Pattern 1: "Month DD, YYYY HH:MM am/pm" (Ada Derana English)
  const longDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
  const m1 = text.match(longDateRe);
  if (m1) {
    try {
      const d = new Date(`${m1[1]} ${m1[2]}, ${m1[3]} ${m1[4]}`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }

  // Pattern 2: "Month DD, YYYY" without time
  const dateOnlyRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i;
  const m2 = text.match(dateOnlyRe);
  if (m2) {
    try {
      const d = new Date(`${m2[1]} ${m2[2]}, ${m2[3]}`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }

  // Pattern 3: YYYY-MM-DD or YYYY.MM.DD
  const isoRe = /\b(\d{4})[-./](\d{2})[-./](\d{2})\b/;
  const m3 = text.match(isoRe);
  if (m3) {
    try {
      const d = new Date(`${m3[1]}-${m3[2]}-${m3[3]}T00:00:00+05:30`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }

  return null;
}

/**
 * Extract first meaningful paragraph as excerpt.
 */
function extractExcerpt(markdown: string, maxLen = 300): string | null {
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('![') || trimmed.startsWith('---')) continue;
    const plain = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '');
    if (plain.length < 40) continue;
    return plain.slice(0, maxLen);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

async function scrapeArticle(url: string): Promise<{
  markdown: string;
  title: string | null;
  author: string | null;
  publishedTime: string | null;
} | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      success: boolean;
      data?: {
        markdown?: string;
        metadata?: Record<string, string>;
      };
    };

    if (!data.success || !data.data?.markdown) return null;
    const meta = data.data.metadata || {};

    // Try metadata first (won't work for Ada Derana, but kept for generality)
    const rawDate = meta.publishedTime
      || meta['article:published_time']
      || meta.dateModified
      || meta.modifiedTime
      || meta['article:modified_time'];
    let publishedTime: string | null = null;
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) publishedTime = d.toISOString();
      } catch {}
    }

    // Fallback: extract date from page text
    if (!publishedTime) {
      publishedTime = extractDateFromText(data.data.markdown.slice(0, 2000));
    }

    return {
      markdown: data.data.markdown,
      title: meta.title || null,
      author: meta.author || null,
      publishedTime,
    };
  } catch {
    return null;
  }
}

/**
 * Scrape a listing page and extract article URLs via Firecrawl.
 */
async function scrapeListingForLinks(
  listingUrl: string,
  pattern: RegExp,
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: listingUrl, formats: ['markdown', 'html'] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      success: boolean;
      data?: { markdown?: string; html?: string };
    };

    const content = (data.data?.html || '') + '\n' + (data.data?.markdown || '');
    if (!content) return [];

    const links = new Set<string>();
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(content)) !== null) {
      // Normalize: strip trailing slashes, ensure https
      let link = m[0].replace(/\/$/, '').replace(/^http:/, 'https:');
      // Ada Derana EN: /news/NNNNN returns 404, need news.php?nid=NNNNN
      const enShortMatch = link.match(/https:\/\/(?:www\.)?adaderana\.lk\/news\/(\d+)/);
      if (enShortMatch) {
        link = `http://www.adaderana.lk/news.php?nid=${enShortMatch[1]}`;
      }
      links.add(link);
    }

    return Array.from(links);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] || '200', 10) : 200;

  const pagesIdx = args.indexOf('--pages');
  const maxPages = pagesIdx !== -1 ? parseInt(args[pagesIdx + 1] || '5', 10) : 5;

  const sourceIdx = args.indexOf('--source');
  const sourceFilter = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;

  log(`${BOLD}BACKFILL ADA DERANA${RESET} — pages: ${maxPages}, limit: ${limit}/source`);

  // Get Ada Derana sources from DB
  const { data: dbSources } = await supabase
    .from('sources')
    .select('id, slug, name, language')
    .eq('is_active', true)
    .like('slug', 'ada-derana-%');

  if (!dbSources || dbSources.length === 0) {
    log(`${RED}✗${RESET} No Ada Derana sources found in database`);
    process.exit(1);
  }

  const sourceMap = new Map(dbSources.map(s => [s.slug, s]));
  let grandTotal = 0;

  for (const adSrc of ADA_DERANA_SOURCES) {
    if (sourceFilter && adSrc.slug !== sourceFilter) continue;
    const dbSource = sourceMap.get(adSrc.slug);
    if (!dbSource) {
      log(`${YELLOW}–${RESET} ${adSrc.slug} not found in DB, skipping`);
      continue;
    }

    log(`\n${'='.repeat(60)}`);
    log(`${BOLD}${dbSource.name}${RESET} (${adSrc.slug})`);
    log(`${'='.repeat(60)}`);

    // Discover article URLs from paginated listing pages
    const allLinks: string[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const pageUrl = `${adSrc.listingUrl}?pageno=${page}`;
      log(`  ${DIM}Crawling listing page ${page}/${maxPages}: ${pageUrl}${RESET}`);

      const links = await scrapeListingForLinks(pageUrl, adSrc.articleUrlPattern);
      if (links.length === 0) {
        log(`  ${YELLOW}–${RESET} No links found on page ${page}, stopping pagination`);
        break;
      }

      allLinks.push(...links);
      log(`  ${GREEN}✓${RESET} Page ${page}: ${links.length} article links`);

      // Pace listing page requests
      await new Promise(r => setTimeout(r, 2000));
    }

    // Deduplicate discovered URLs
    const uniqueLinks = [...new Set(allLinks)];
    log(`  Found ${uniqueLinks.length} unique article URLs across ${maxPages} pages`);

    // Deduplicate against existing DB articles
    const { data: existing } = await supabase
      .from('articles')
      .select('url')
      .eq('source_id', dbSource.id);
    const existingUrls = new Set((existing || []).map(a => a.url));

    // Extract article ID for dedup — handles both /news/NNNNN and news.php?nid=NNNNN
    function extractArticleId(u: string): string | null {
      const m = u.match(/(?:news\.php\?nid=|\/news\/)(\d+)/);
      return m ? m[1] : null;
    }
    const existingIds = new Set(
      (existing || []).map(a => extractArticleId(a.url)).filter(Boolean) as string[]
    );

    const newLinks = uniqueLinks.filter(u => {
      if (existingUrls.has(u)) return false;
      const id = extractArticleId(u);
      if (id && existingIds.has(id)) return false;
      return true;
    });
    log(`  ${newLinks.length} are new (${uniqueLinks.length - newLinks.length} already exist)`);

    const toProcess = newLinks.slice(0, limit);
    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const url = toProcess[i];
      log(`  ${DIM}[${i + 1}/${toProcess.length}]${RESET} Scraping: ${url.slice(-60)}`);

      const scraped = await scrapeArticle(url);
      if (!scraped || scraped.markdown.length < 200) {
        log(`    ${RED}✗${RESET} Scrape failed or content too short`);
        failed++;
        continue;
      }

      const title = scraped.title || 'Untitled';
      const excerpt = extractExcerpt(scraped.markdown);

      let publishedAt: string | null = null;
      if (scraped.publishedTime) {
        try { publishedAt = new Date(scraped.publishedTime).toISOString(); } catch {}
      }

      const { error: insertErr } = await supabase.from('articles').insert({
        source_id: dbSource.id,
        url,
        title,
        content: scraped.markdown,
        excerpt,
        published_at: publishedAt,
        author: scraped.author || null, // Ada Derana has no author attribution
        language: dbSource.language,
        original_language: dbSource.language,
        is_processed: false,
        is_backfill: true,
      });

      if (insertErr) {
        if (insertErr.message?.includes('duplicate')) {
          log(`    ${YELLOW}–${RESET} ${title.slice(0, 50)}... (duplicate URL)`);
        } else {
          log(`    ${RED}✗${RESET} ${title.slice(0, 50)}... (${insertErr.message})`);
          failed++;
        }
      } else {
        const dateStr = publishedAt ? new Date(publishedAt).toLocaleDateString() : 'no date';
        log(`    ${GREEN}✓${RESET} ${title.slice(0, 50)}... (${scraped.markdown.length} chars, ${dateStr})`);
        inserted++;
      }

      // Rate limit: 2 seconds between scrapes
      await new Promise(r => setTimeout(r, 2000));
    }

    log(`\n  ${GREEN}▸${RESET} ${dbSource.name}: ${inserted} inserted, ${failed} failed`);
    grandTotal += inserted;
  }

  log(`\n${'='.repeat(60)}`);
  log(`${GREEN}▸${RESET} Ada Derana backfill complete: ${grandTotal} total articles inserted`);
  log(`Run ${BOLD}npx tsx scripts/pipeline.ts --enrich${RESET} to enrich them.`);
}

main().catch((err) => {
  log(`${RED}✗${RESET} Unexpected error: ${err}`);
  process.exit(1);
});
