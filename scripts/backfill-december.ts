/**
 * Backfill December 2025 articles from source sitemaps.
 *
 * Usage:
 *   npx tsx scripts/backfill-december.ts [--limit N] [--source slug]
 *
 * Uses sitemaps to discover article URLs published in December 2025,
 * then scrapes each via Firecrawl and inserts into Supabase.
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
// Sitemap-based source configs for December 2025
// ---------------------------------------------------------------------------

interface SitemapSource {
  slug: string;
  sitemapUrls: string[];
}

// Sources with known sitemap structure containing Dec 2025 articles
const SITEMAP_SOURCES: SitemapSource[] = [
  {
    slug: 'divaina',
    sitemapUrls: [
      'https://www.divaina.lk/post-sitemap13.xml', // Dec 5-15
      'https://www.divaina.lk/post-sitemap14.xml', // Dec 21 - Jan 1
    ],
  },
  {
    slug: 'the-island',
    sitemapUrls: [
      'http://island.lk/wp-sitemap-posts-post-36.xml',
      'http://island.lk/wp-sitemap-posts-post-37.xml',
    ],
  },
  {
    slug: 'ada-derana-en',
    sitemapUrls: [
      'https://www.adaderana.lk/sitemap.xml',
    ],
  },
  {
    slug: 'onlanka',
    sitemapUrls: [
      'https://www.onlanka.com/post-sitemap26.xml', // Contains ~207 Dec 2025 articles
      'https://www.onlanka.com/post-sitemap27.xml', // Jan 2026+
    ],
  },
  {
    slug: 'mawbima',
    sitemapUrls: [
      'https://mawbima.lk/post-sitemap79.xml', // Nov 30 - Dec 29
      'https://mawbima.lk/post-sitemap80.xml', // Dec 29 - Jan 30
    ],
  },
  {
    slug: 'lanka-business-online',
    sitemapUrls: [
      'https://www.lankabusinessonline.com/sitemap-pt-post-p1-2025-12.xml',
      'https://www.lankabusinessonline.com/sitemap-pt-post-p2-2025-12.xml',
      'https://www.lankabusinessonline.com/sitemap-pt-post-p3-2025-12.xml',
      'https://www.lankabusinessonline.com/sitemap-pt-post-p4-2025-12.xml',
    ],
  },
];

// ---------------------------------------------------------------------------
// Archive page-based sources (paginated listing pages)
// ---------------------------------------------------------------------------

interface ArchiveSource {
  slug: string;
  archiveUrls: string[];
  linkPattern: RegExp;
}

const ARCHIVE_SOURCES: ArchiveSource[] = [
  {
    slug: 'economynext',
    archiveUrls: [
      'https://economynext.com/page/1/',
      'https://economynext.com/page/2/',
      'https://economynext.com/page/3/',
      'https://economynext.com/page/4/',
      'https://economynext.com/page/5/',
    ],
    linkPattern: /https:\/\/economynext\.com\/[a-z0-9-]+-\d+\//g,
  },
  {
    slug: 'newswire',
    archiveUrls: [
      'https://www.newswire.lk/page/1/',
      'https://www.newswire.lk/page/2/',
      'https://www.newswire.lk/page/3/',
    ],
    linkPattern: /https:\/\/www\.newswire\.lk\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\//g,
  },
  {
    slug: 'daily-ft',
    archiveUrls: [
      'https://www.ft.lk/front-page/33',
      'https://www.ft.lk/top-story/26',
    ],
    linkPattern: /https:\/\/www\.ft\.lk\/[a-z-]+\/[^"'\s]+/g,
  },
  {
    slug: 'news19',
    archiveUrls: [
      'https://www.news19.lk/',
      'https://www.news19.lk/page/2/',
      'https://www.news19.lk/page/3/',
    ],
    linkPattern: /https:\/\/www\.news19\.lk\/[a-z0-9-]+\//g,
  },
  // NewsFist (Angular SPA — requires Firecrawl/Playwright to render)
  // URL format: https://english.newsfirst.lk/YYYY/MM/DD/slug
  {
    slug: 'newsfirst-en',
    archiveUrls: [
      'https://english.newsfirst.lk/',
      'https://english.newsfirst.lk/latest-news',
      'https://english.newsfirst.lk/politics',
      'https://english.newsfirst.lk/business',
      'https://english.newsfirst.lk/sports',
    ],
    linkPattern: /https:\/\/english\.newsfirst\.lk\/202[56]\/\d{2}\/\d{2}\/[a-z0-9%\-]+/g,
  },
  {
    slug: 'newsfirst-si',
    archiveUrls: [
      'https://sinhala.newsfirst.lk/',
      'https://sinhala.newsfirst.lk/latest-news',
    ],
    linkPattern: /https:\/\/sinhala\.newsfirst\.lk\/202[56]\/\d{2}\/\d{2}\/[^\s"'<>]+/g,
  },
  {
    slug: 'newsfirst-ta',
    archiveUrls: [
      'https://tamil.newsfirst.lk/',
      'https://tamil.newsfirst.lk/latest-news',
    ],
    linkPattern: /https:\/\/tamil\.newsfirst\.lk\/202[56]\/\d{2}\/\d{2}\/[^\s"'<>]+/g,
  },
  // Daily Mirror — Firecrawl returns empty HTML (site blocks scraping)
  // {
  //   slug: 'daily-mirror',
  //   archiveUrls: ['https://www.dailymirror.lk/top-story/155'],
  //   linkPattern: /https:\/\/www\.dailymirror\.lk\/[a-z-]+\/[^"'\s]+/g,
  // },
  // Sri Lanka Mirror
  {
    slug: 'sri-lanka-mirror',
    archiveUrls: [
      'https://srilankamirror.com/',
      'https://srilankamirror.com/news',
    ],
    linkPattern: /https:\/\/srilankamirror\.com\/news\/\d+-[a-z0-9-]+/g,
  },
  // Dinamina — Firecrawl returns empty HTML (site blocks scraping)
  // {
  //   slug: 'dinamina',
  //   archiveUrls: ['https://www.dinamina.lk/'],
  //   linkPattern: /https:\/\/www\.dinamina\.lk\/[^"'\s]+/g,
  // },
  // Lankadeepa
  {
    slug: 'lankadeepa',
    archiveUrls: [
      'https://www.lankadeepa.lk/',
      'https://www.lankadeepa.lk/latest_news/1',
    ],
    linkPattern: /https:\/\/www\.lankadeepa\.lk\/[^"'\s]+\/\d+/g,
  },
  // Silumina
  {
    slug: 'silumina',
    archiveUrls: [
      'https://www.silumina.lk/',
    ],
    linkPattern: /https:\/\/www\.silumina\.lk\/[^"'\s]+/g,
  },
  // News.lk — Firecrawl returns minimal HTML (site blocks/redirects)
  // {
  //   slug: 'news-lk',
  //   archiveUrls: ['https://www.news.lk/news/political-current-affairs'],
  //   linkPattern: /https:\/\/www\.news\.lk\/news\/[^"'\s]+/g,
  // },
  // Sunday Observer
  {
    slug: 'sunday-observer',
    archiveUrls: [
      'https://www.sundayobserver.lk/',
      'https://www.sundayobserver.lk/news',
    ],
    linkPattern: /https:\/\/www\.sundayobserver\.lk\/[^"'\s]+/g,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchSitemap(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();

    const urls: string[] = [];
    const locRegex = /<loc>(.*?)<\/loc>/gi;
    const lastmodRegex = /<lastmod>(.*?)<\/lastmod>/gi;

    const locs: string[] = [];
    const lastmods: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = locRegex.exec(text)) !== null) locs.push(m[1].trim());
    while ((m = lastmodRegex.exec(text)) !== null) lastmods.push(m[1].trim());

    for (let i = 0; i < locs.length; i++) {
      const loc = locs[i];
      const mod = lastmods[i] || '';

      // Keep only December 2025 articles
      if (mod && mod.startsWith('2025-12')) {
        urls.push(loc);
      } else if (!mod) {
        // No lastmod — include if URL looks like an article (not a category)
        urls.push(loc);
      }
    }

    return urls;
  } catch (err) {
    log(`  ${RED}✗${RESET} Sitemap fetch failed: ${url} — ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

async function fetchArchiveLinks(url: string, pattern: RegExp): Promise<string[]> {
  try {
    // Use Firecrawl (Playwright) to render JS-heavy pages (Angular SPAs etc.)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['html'] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      success: boolean;
      data?: { html?: string; markdown?: string };
    };

    const html = data.data?.html || data.data?.markdown || '';
    if (!html) {
      log(`  ${RED}✗${RESET} Firecrawl returned no content for: ${url}`);
      return [];
    }

    const links = new Set<string>();
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(html)) !== null) {
      links.add(m[0]);
    }
    return Array.from(links);
  } catch (err) {
    log(`  ${RED}✗${RESET} Archive fetch failed: ${url} — ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

async function scrapeArticle(url: string): Promise<{
  markdown: string;
  title: string | null;
  author: string | null;
  publishedTime: string | null;
} | null> {
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
      data?: {
        markdown?: string;
        metadata?: Record<string, string>;
      };
    };

    if (!data.success || !data.data?.markdown) return null;
    const meta = data.data.metadata || {};

    // Extract date from multiple metadata fields, then fall back to URL pattern
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
    if (!publishedTime) {
      const urlMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (urlMatch) {
        publishedTime = `${urlMatch[1]}-${urlMatch[2]}-${urlMatch[3]}T00:00:00+05:30`;
      }
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] || '50', 10) : 50;

  const sourceIdx = args.indexOf('--source');
  const sourceFilter = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;

  log(`${BOLD}BACKFILL${RESET} — scraping December 2025 articles (limit: ${limit})`);

  // Get all active sources from DB
  const { data: dbSources } = await supabase
    .from('sources')
    .select('id, slug, name, language')
    .eq('is_active', true);

  if (!dbSources || dbSources.length === 0) {
    log(`${RED}✗${RESET} No sources found in database`);
    process.exit(1);
  }

  const sourceMap = new Map(dbSources.map(s => [s.slug, s]));
  let totalInserted = 0;

  // Process sitemap-based sources
  for (const src of SITEMAP_SOURCES) {
    if (sourceFilter && src.slug !== sourceFilter) continue;
    const dbSource = sourceMap.get(src.slug);
    if (!dbSource) continue;

    log(`\n${BOLD}${dbSource.name}${RESET} (sitemap)`);

    let articleUrls: string[] = [];
    for (const sitemapUrl of src.sitemapUrls) {
      const urls = await fetchSitemap(sitemapUrl);
      articleUrls.push(...urls);
    }

    // Filter out non-article URLs (categories, tags, images, feeds, etc.)
    articleUrls = articleUrls.filter(u =>
      !u.includes('/category/') &&
      !u.includes('/tag/') &&
      !u.includes('/author/') &&
      !u.includes('/page/') &&
      !/\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(u) &&
      !/\/feed\/?$/.test(u) &&
      !/\/print\/?$/.test(u) &&
      !/\/wp-content\/uploads\//.test(u)
    );

    log(`  Found ${articleUrls.length} potential December 2025 URLs`);

    // Deduplicate against existing
    const { data: existing } = await supabase
      .from('articles')
      .select('url')
      .eq('source_id', dbSource.id);
    const existingUrls = new Set((existing || []).map(a => a.url));

    let newUrls = articleUrls.filter(u => !existingUrls.has(u));
    log(`  ${newUrls.length} are new (${articleUrls.length - newUrls.length} already exist)`);

    newUrls = newUrls.slice(0, limit);
    let inserted = 0;

    for (const url of newUrls) {
      const scraped = await scrapeArticle(url);
      if (!scraped || scraped.markdown.length < 200) {
        log(`  ${RED}✗${RESET} ${url.slice(-50)} (scrape failed)`);
        continue;
      }

      const title = scraped.title || url.split('/').pop()?.replace(/-/g, ' ') || 'Untitled';

      let publishedAt: string | null = null;
      if (scraped.publishedTime) {
        try { publishedAt = new Date(scraped.publishedTime).toISOString(); } catch {}
      }

      const { error: insertErr } = await supabase.from('articles').insert({
        source_id: dbSource.id,
        url,
        title,
        content: scraped.markdown,
        published_at: publishedAt,
        author: scraped.author || null,
        language: dbSource.language,
        original_language: dbSource.language,
        is_processed: false,
        is_backfill: true,
      });

      if (insertErr) {
        if (insertErr.message?.includes('duplicate')) {
          log(`  ${YELLOW}–${RESET} ${title.slice(0, 50)}... (duplicate)`);
        } else {
          log(`  ${RED}✗${RESET} ${title.slice(0, 50)}... (${insertErr.message})`);
        }
      } else {
        log(`  ${GREEN}✓${RESET} ${title.slice(0, 50)}... (${scraped.markdown.length} chars)`);
        inserted++;
      }

      // Pace requests to not overwhelm Firecrawl
      await new Promise(r => setTimeout(r, 2000));
    }

    totalInserted += inserted;
    log(`  ${GREEN}▸${RESET} ${dbSource.name}: ${inserted} articles backfilled`);
  }

  // Process archive-based sources
  for (const src of ARCHIVE_SOURCES) {
    if (sourceFilter && src.slug !== sourceFilter) continue;
    const dbSource = sourceMap.get(src.slug);
    if (!dbSource) continue;

    log(`\n${BOLD}${dbSource.name}${RESET} (archive pages)`);

    let articleUrls: string[] = [];
    for (const archiveUrl of src.archiveUrls) {
      const links = await fetchArchiveLinks(archiveUrl, src.linkPattern);
      articleUrls.push(...links);
    }

    // Deduplicate and filter non-article URLs
    articleUrls = [...new Set(articleUrls)].filter(u =>
      !/\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(u) &&
      !/\/feed\/?$/.test(u) &&
      !/\/print\/?$/.test(u) &&
      !/\/wp-content\/uploads\//.test(u) &&
      !/\/category\//.test(u) &&
      !/\/tag\//.test(u)
    );
    log(`  Found ${articleUrls.length} article links from archive pages`);

    const { data: existing } = await supabase
      .from('articles')
      .select('url')
      .eq('source_id', dbSource.id);
    const existingUrls = new Set((existing || []).map(a => a.url));

    let newUrls = articleUrls.filter(u => !existingUrls.has(u));
    log(`  ${newUrls.length} are new`);

    newUrls = newUrls.slice(0, limit);
    let inserted = 0;

    for (const url of newUrls) {
      const scraped = await scrapeArticle(url);
      if (!scraped || scraped.markdown.length < 200) {
        log(`  ${RED}✗${RESET} ${url.slice(-50)} (scrape failed)`);
        continue;
      }

      const title = scraped.title || 'Untitled';

      let publishedAt: string | null = null;
      if (scraped.publishedTime) {
        try { publishedAt = new Date(scraped.publishedTime).toISOString(); } catch {}
      }

      const { error: insertErr } = await supabase.from('articles').insert({
        source_id: dbSource.id,
        url,
        title,
        content: scraped.markdown,
        published_at: publishedAt,
        author: scraped.author || null,
        language: dbSource.language,
        original_language: dbSource.language,
        is_processed: false,
        is_backfill: true,
      });

      if (insertErr) {
        if (insertErr.message?.includes('duplicate')) {
          log(`  ${YELLOW}–${RESET} ${title.slice(0, 50)}... (duplicate)`);
        } else {
          log(`  ${RED}✗${RESET} ${title.slice(0, 50)}... (${insertErr.message})`);
        }
      } else {
        log(`  ${GREEN}✓${RESET} ${title.slice(0, 50)}... (${scraped.markdown.length} chars)`);
        inserted++;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    totalInserted += inserted;
    log(`  ${GREEN}▸${RESET} ${dbSource.name}: ${inserted} articles backfilled`);
  }

  log(`\n${GREEN}▸${RESET} Backfill complete: ${totalInserted} December 2025 articles inserted`);
  log(`Run ${BOLD}npm run pipeline:enrich${RESET} to enrich them.`);
}

main().catch((err) => {
  log(`${RED}✗${RESET} Unexpected error: ${err}`);
  process.exit(1);
});
