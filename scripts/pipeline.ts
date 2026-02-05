/**
 * News pipeline orchestrator — replaces n8n workflows with plain TypeScript.
 *
 * Usage:
 *   npx tsx scripts/pipeline.ts --ingest             # ingest from all active RSS sources
 *   npx tsx scripts/pipeline.ts --enrich             # enrich unenriched articles
 *   npx tsx scripts/pipeline.ts --cluster            # cluster enriched articles into stories
 *   npx tsx scripts/pipeline.ts --graph              # sync enriched articles to Graphiti knowledge graph
 *   npx tsx scripts/pipeline.ts --all                # run full pipeline (ingest → enrich → graph → cluster)
 *   npx tsx scripts/pipeline.ts --daemon             # run on schedule (ingest 2h, enrich 3h, cluster 6h)
 *
 * Options:
 *   --limit N       Max articles per source for ingest / per batch for enrich (default: 20)
 *   --threshold N   Cosine similarity threshold for clustering (default: 0.80)
 *   --llm ollama    Use Ollama (qwen3:1.7b) instead of OpenRouter for LLM analysis
 *   --llm openrouter Use OpenRouter (default)
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
import { chromium } from 'playwright-core';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const PLAYWRIGHT_WS = process.env.PLAYWRIGHT_WS_URL || 'ws://localhost:3100';
const openrouterKey = process.env.OPENROUTER_API_KEY!;
const openrouterModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
const ollamaLlmModel = process.env.OLLAMA_LLM_MODEL || 'qwen3:1.7b';
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b';
const embeddingDims = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);
const graphitiUrl = process.env.GRAPHITI_API_URL || 'http://localhost:8000';

// LLM provider: 'openrouter' or 'ollama' — set via --llm flag or LLM_PROVIDER env var
let llmProvider: 'openrouter' | 'ollama' = (process.env.LLM_PROVIDER as 'openrouter' | 'ollama') || 'openrouter';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function timestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function log(msg: string) {
  console.log(`${DIM}[${timestamp()}]${RESET} ${msg}`);
}

// ---------------------------------------------------------------------------
// Per-source scraping configuration
// ---------------------------------------------------------------------------

interface ScrapeConfig {
  method?: string;
  api_url?: string;
  edition_sections?: string[];
  cloudflare?: boolean;
  platform?: string;
  selectors?: {
    title?: string[];
    author?: string[];
    date?: string[];
    content?: string[];
    image?: string[];
  };
  rateLimitMs?: number;
}

/** Default CSS selectors — work for most WordPress/news sites */
const DEFAULT_SELECTORS = {
  title: [
    'h1.entry-title', 'h1.article-title', 'h1.post-title',
    'article h1', '.article-header h1', 'h1',
  ],
  author: [
    '.author-name', '.byline', '.article-author', '.writer-name',
    '[rel="author"]', '.post-author',
  ],
  date: [
    'time[datetime]', '.publish-date', '.article-date',
    '.post-date', '.entry-date', '.date', '.news-datestamp',
  ],
  content: [
    'article .entry-content', '.article-body', '.article-content',
    '.story-text', '.inner-content', '.entry-content', '.post-content',
    '.content-area', '#article-body', '.inner-fontstyle', 'article', 'main .content',
  ],
  image: [
    '.article-image img', 'article img', '.featured-image img',
  ],
};

/** Default meta tags to check for dates and authors */
const DEFAULT_DATE_META = [
  'article:published_time', 'og:article:published_time',
  'datePublished', 'publishedTime', 'dateModified', 'modifiedTime',
];
const DEFAULT_AUTHOR_META = ['author', 'article:author'];

/** Merge source-specific selectors with defaults */
function getSelectors(config: ScrapeConfig): Required<NonNullable<ScrapeConfig['selectors']>> {
  const s = config.selectors || {};
  return {
    title: s.title?.length ? s.title : DEFAULT_SELECTORS.title,
    author: s.author?.length ? s.author : DEFAULT_SELECTORS.author,
    date: s.date?.length ? s.date : DEFAULT_SELECTORS.date,
    content: s.content?.length ? s.content : DEFAULT_SELECTORS.content,
    image: s.image?.length ? s.image : DEFAULT_SELECTORS.image,
  };
}

// ---------------------------------------------------------------------------
// Text normalization and deduplication helpers
// ---------------------------------------------------------------------------

/** Normalize Unicode text — fix common encoding issues in Sinhala/Tamil content */
function normalizeText(text: string): string {
  return text
    // Normalize Unicode (NFC for composed form — important for Sinhala conjuncts)
    .normalize('NFC')
    // Fix HTML entities that weren't decoded
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&hellip;/g, '…')
    // Decode numeric HTML entities (&#8217; &#x2019; etc.)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    // Fix double-encoded UTF-8 (shows as Ã¢â‚¬ etc.)
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬â€/g, "—")
    .replace(/Ã¢â‚¬Â¦/g, "…")
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize title for deduplication comparison */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u200C\u200D]/gu, '') // Keep letters+numbers+ZWJ/ZWNJ (needed for Sinhala/Tamil conjuncts)
    .trim();
}

// ===========================================================================
// STEP 1: INGEST
// ===========================================================================

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

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('iso-8859-1').decode(buffer);
  }

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

    let imageUrl: string | null = null;
    if (description) {
      const imgMatch = description.match(/src=['"](https?:\/\/[^'"]+)['"]/i);
      if (imgMatch) imageUrl = imgMatch[1];
    }

    // Filter to 2025+ only
    if (pubDate) {
      try {
        if (new Date(pubDate).getFullYear() < 2025) continue;
      } catch {}
    }

    if (link) {
      items.push({ title, link, pubDate, description, imageUrl });
    }
  }

  return items;
}

/**
 * Extract a publish date from article page text content.
 * Handles formats like "February 4, 2026 02:39 pm" (Ada Derana style)
 * and "2026-02-04" ISO-like patterns.
 */
function extractDateFromText(text: string): string | null {
  // Pattern 1: "Month DD, YYYY HH:MM am/pm" (Ada Derana English style)
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

  // Pattern 3: Sinhala-style "YYYY-MM-DD" or "YYYY.MM.DD" in page text
  const isoRe = /\b(\d{4})[-./](\d{2})[-./](\d{2})\b/;
  const m3 = text.match(isoRe);
  if (m3) {
    try {
      const d = new Date(`${m3[1]}-${m3[2]}-${m3[3]}T00:00:00+05:30`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }

  // Pattern 4: "DD Month YYYY" (e.g., "4 February 2026", "05 Feb 2026")
  const dmyLongRe = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i;
  const m4 = text.match(dmyLongRe);
  if (m4) {
    try {
      const d = new Date(`${m4[2]} ${m4[1]}, ${m4[3]}`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }

  // Pattern 5: "DD/MM/YYYY" or "DD-MM-YYYY" (Sri Lankan DMY format)
  const dmyRe = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/;
  const m5 = text.match(dmyRe);
  if (m5) {
    try {
      const d = new Date(`${m5[3]}-${m5[2].padStart(2, '0')}-${m5[1].padStart(2, '0')}T00:00:00+05:30`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }

  return null;
}

/**
 * Scrape a single article page using Playwright.
 * Uses per-source CSS selectors (with defaults) to extract title, content, date, author, image.
 * Date extraction waterfall: meta tags → CSS selectors → text patterns → URL pattern.
 */
async function scrapeArticlePage(
  context: { newPage: () => Promise<any> },
  url: string,
  config: ScrapeConfig,
  rssPubDate: string | null,
): Promise<{
  content: string;
  title: string | null;
  author: string | null;
  publishedTime: string | null;
  imageUrl: string | null;
} | null> {
  const sel = getSelectors(config);
  let page: any = null;

  try {
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for Cloudflare challenge if needed
    if (config.cloudflare) {
      for (let i = 0; i < 5; i++) {
        await page.waitForTimeout(3000);
        const title = await page.title();
        if (!title.includes('Just a moment') && !title.includes('Checking')) break;
      }
    } else {
      await page.waitForTimeout(2000);
    }

    // Extract everything in a single page.evaluate call
    const result = await page.evaluate((params: {
      sel: typeof sel;
      dateMetaTags: string[];
      authorMetaTags: string[];
    }) => {
      const { sel: s, dateMetaTags, authorMetaTags } = params;

      // Helper: try a list of CSS selectors, return first non-empty textContent
      function trySelectors(selectors: string[]): string {
        for (const css of selectors) {
          // Handle meta tag selectors
          if (css.startsWith('meta[')) {
            const el = document.querySelector(css) as HTMLMetaElement;
            if (el?.content?.trim()) return el.content.trim();
            continue;
          }
          const el = document.querySelector(css);
          if (el && el.textContent && el.textContent.trim().length > 0) {
            return el.textContent.trim();
          }
        }
        return '';
      }

      // Helper: get attribute from first matching selector
      function trySelectorsAttr(selectors: string[], attr: string): string {
        for (const css of selectors) {
          const el = document.querySelector(css);
          if (el) {
            const val = el.getAttribute(attr);
            if (val) return val.trim();
          }
        }
        return '';
      }

      // --- Collect all meta tags ---
      const metas: Record<string, string> = {};
      document.querySelectorAll('meta').forEach((m) => {
        const name = m.getAttribute('property') || m.getAttribute('name') || '';
        const content = m.getAttribute('content') || '';
        if (name && content) metas[name] = content;
      });

      // --- Title ---
      const title = trySelectors(s.title) || metas['og:title'] || '';

      // --- Author ---
      let author = '';
      // Try meta tags first
      for (const key of authorMetaTags) {
        if (metas[key]) { author = metas[key]; break; }
      }
      // Then CSS selectors
      if (!author) author = trySelectors(s.author);

      // --- Date ---
      let dateStr = '';
      // 1. Try meta tags
      for (const key of dateMetaTags) {
        if (metas[key]) { dateStr = metas[key]; break; }
      }
      // 2. Try CSS selectors with datetime attribute
      if (!dateStr) dateStr = trySelectorsAttr(s.date, 'datetime');
      // 3. Try CSS selectors text content
      if (!dateStr) dateStr = trySelectors(s.date);

      // --- Content ---
      let content = '';
      for (const css of s.content) {
        const el = document.querySelector(css);
        if (el && el.textContent && el.textContent.trim().length > 200) {
          content = el.textContent.trim();
          break;
        }
      }
      if (!content) content = document.body?.textContent?.trim() || '';

      // --- Image ---
      const imageUrl = metas['og:image']
        || trySelectorsAttr(s.image, 'src')
        || (document.querySelector('article img') as HTMLImageElement)?.src
        || '';

      // Body text for date fallback
      const bodyText = document.body?.textContent?.trim().slice(0, 3000) || '';

      return { title, author, dateStr, content, imageUrl, bodyText };
    }, { sel, dateMetaTags: DEFAULT_DATE_META, authorMetaTags: DEFAULT_AUTHOR_META });

    await page.close();
    page = null;

    if (!result.content || result.content.length < 100) return null;

    // --- Date extraction waterfall ---
    let publishedTime: string | null = null;

    // 1. Meta tag / selector date
    if (result.dateStr) {
      try {
        const d = new Date(result.dateStr);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) publishedTime = d.toISOString();
      } catch {}
    }

    // 2. Text extraction from date selector text (may be human-readable)
    if (!publishedTime && result.dateStr) {
      publishedTime = extractDateFromText(result.dateStr);
    }

    // 3. URL path pattern (e.g. /2026/02/04/)
    if (!publishedTime) {
      const urlMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (urlMatch) {
        const d = new Date(`${urlMatch[1]}-${urlMatch[2]}-${urlMatch[3]}T00:00:00+05:30`);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) publishedTime = d.toISOString();
      }
    }

    // 4. Page body text extraction (for sites like Ada Derana with date in text)
    if (!publishedTime) {
      publishedTime = extractDateFromText(result.bodyText);
    }

    // 5. RSS pubDate as final fallback
    if (!publishedTime && rssPubDate) {
      try {
        const d = new Date(rssPubDate);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) publishedTime = d.toISOString();
      } catch {}
    }

    return {
      content: normalizeText(result.content),
      title: result.title ? normalizeText(result.title) : null,
      author: result.author ? normalizeText(result.author) : null,
      publishedTime,
      imageUrl: result.imageUrl || null,
    };
  } catch (err) {
    if (page) await page.close().catch(() => {});
    return null;
  }
}

/**
 * Extract the first meaningful paragraph from markdown content for use as excerpt.
 * Strips headings, images, links-only lines, and short fragments.
 */
function extractExcerpt(markdown: string, maxLen = 300): string | null {
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty, headings, images, very short lines
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('![')) continue;
    if (trimmed.startsWith('---')) continue;
    // Strip markdown links but keep text
    const plain = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '');
    if (plain.length < 40) continue;
    return plain.slice(0, maxLen);
  }
  return null;
}

/**
 * Scrape article links from a source's listing page using Playwright (fallback when RSS is broken).
 * Returns a list of {link, title} extracted from anchor tags in the page HTML.
 */
async function scrapeListingPage(
  browser: any,
  sourceUrl: string,
  sourceSlug: string,
  limit: number,
): Promise<RSSItem[]> {
  if (!browser) return [];

  // Source-specific listing page URLs
  let listingUrl = sourceUrl;
  if (sourceSlug === 'ada-derana-si') {
    listingUrl = 'https://sinhala.adaderana.lk/';
  } else if (sourceSlug === 'ada-derana-en') {
    listingUrl = 'https://www.adaderana.lk/hot-news/';
  }

  let context: any = null;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const links = await page.evaluate((params: { baseUrl: string; slug: string }) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const articleLinks: Array<{ url: string; title: string }> = [];
      const seen = new Set<string>();

      for (const a of anchors) {
        let href = (a as HTMLAnchorElement).href;
        const text = a.textContent?.trim() || '';

        // Must be same domain and have reasonable title
        if (!href.startsWith(params.baseUrl) && !href.startsWith('/')) continue;
        if (text.length < 10 || text.length > 300) continue;
        if (seen.has(href)) continue;

        // Skip navigation/category/media links
        if (/\/(category|tag|page|author|wp-content|feed|login)\//i.test(href)) continue;
        if (/\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(href)) continue;

        // For Ada Derana, only keep news URLs
        if (params.slug.startsWith('ada-derana')) {
          if (!/\/news[/.]/.test(href) && !/\/sports[/.]/.test(href)) continue;
          // Normalize to base /news/ID
          href = href.replace(/^http:/, 'https:');
          const baseMatch = href.match(/(https:\/\/[^/]+\/news\/\d+)/);
          if (baseMatch) href = baseMatch[1];
        } else {
          // Generic: must have enough path segments
          if (href.split('/').filter(Boolean).length < 4) continue;
        }

        // Skip generic link text
        if (/^(වැඩි විස්තර|more|comments|\(\d+\)|read more)/i.test(text)) continue;

        if (seen.has(href)) continue;
        seen.add(href);
        articleLinks.push({ url: href, title: text });
      }
      return articleLinks;
    }, { baseUrl: listingUrl.replace(/\/[^/]*$/, ''), slug: sourceSlug });

    await page.close();
    await context.close();
    context = null;

    return links.slice(0, limit).map(l => ({
      title: l.title,
      link: l.url,
      pubDate: null,
      description: null,
      imageUrl: null,
    }));
  } catch {
    if (context) await context.close().catch(() => {});
    return [];
  }
}

// ---------------------------------------------------------------------------
// Special ingestion methods for non-RSS sources
// ---------------------------------------------------------------------------

/**
 * Fetch articles from News 1st JSON API.
 * API: {api_url}/{page}/{count} — returns full HTML content, no scraping needed.
 */
async function fetchNewsfirstAPI(apiUrl: string, limit: number): Promise<RSSItem[]> {
  const items: RSSItem[] = [];
  const perPage = Math.min(limit, 20);
  const pages = Math.ceil(limit / perPage);

  for (let page = 0; page < pages && items.length < limit; page++) {
    try {
      const res = await fetch(`${apiUrl}/${page}/${perPage}`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) break;
      const data = await res.json() as {
        postResponseDto?: Array<{
          id: string;
          title?: { rendered?: string };
          content?: { rendered?: string };
          date_gmt?: string;
          post_url?: string;
          short_title?: string;
          images?: { large_tile_image?: string };
          author?: string;
        }>;
      };

      const posts = data.postResponseDto || [];
      if (posts.length === 0) break;

      for (const post of posts) {
        const title = post.title?.rendered || post.short_title || 'Untitled';
        const postUrl = post.post_url || '';
        // Determine base domain from API URL
        const isEnglish = apiUrl.includes('apienglish');
        const isSinhala = apiUrl.includes('apisinhala');
        const isTamil = apiUrl.includes('apitamil');
        const baseDomain = isEnglish ? 'https://english.newsfirst.lk'
          : isSinhala ? 'https://sinhala.newsfirst.lk'
          : isTamil ? 'https://tamil.newsfirst.lk'
          : 'https://english.newsfirst.lk';
        const link = `${baseDomain}/${postUrl}`;

        // Filter to 2025+ only
        if (post.date_gmt) {
          try {
            if (new Date(post.date_gmt).getFullYear() < 2025) continue;
          } catch {}
        }

        // Strip HTML tags from content for markdown
        const htmlContent = post.content?.rendered || '';
        const plainContent = htmlContent.replace(/<[^>]*>/g, '').trim();

        items.push({
          title: title.replace(/<[^>]*>/g, ''),
          link,
          pubDate: post.date_gmt || null,
          description: plainContent.slice(0, 500) || null,
          imageUrl: post.images?.large_tile_image || null,
          // Store full content in description for direct insert (skip Firecrawl scrape)
          _fullContent: plainContent,
          _author: post.author || null,
        } as RSSItem & { _fullContent?: string; _author?: string });
      }
    } catch (err) {
      log(`  ${RED}✗${RESET} News 1st API page ${page} failed: ${err instanceof Error ? err.message : err}`);
      break;
    }
  }

  return items.slice(0, limit);
}

/**
 * Fetch articles from WordPress REST API.
 * Returns full post data including content, date, author.
 */
async function fetchWordPressAPI(apiUrl: string, limit: number): Promise<RSSItem[]> {
  const items: RSSItem[] = [];
  const perPage = Math.min(limit, 20);

  try {
    const res = await fetch(`${apiUrl}?per_page=${perPage}&orderby=date&order=desc&_fields=id,date,title,content,excerpt,link,yoast_head_json`, {
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GroundNewsSL/1.0)' },
    });
    if (!res.ok) {
      log(`  ${RED}✗${RESET} WP API returned ${res.status}`);
      return [];
    }
    const posts = await res.json() as Array<{
      id: number;
      date: string;
      title?: { rendered?: string };
      content?: { rendered?: string };
      excerpt?: { rendered?: string };
      link?: string;
      yoast_head_json?: { author?: string; og_image?: Array<{ url?: string }> };
    }>;

    for (const post of posts) {
      const title = (post.title?.rendered || 'Untitled').replace(/<[^>]*>/g, '');
      const link = post.link || '';
      const htmlContent = post.content?.rendered || '';
      const plainContent = htmlContent.replace(/<[^>]*>/g, '').trim();
      const excerptText = (post.excerpt?.rendered || '').replace(/<[^>]*>/g, '').trim();
      const author = post.yoast_head_json?.author || null;
      const imageUrl = post.yoast_head_json?.og_image?.[0]?.url || null;

      // Filter to 2025+
      if (post.date) {
        try { if (new Date(post.date).getFullYear() < 2025) continue; } catch {}
      }

      items.push({
        title,
        link,
        pubDate: post.date || null,
        description: excerptText || plainContent.slice(0, 500) || null,
        imageUrl,
        _fullContent: plainContent,
        _author: author,
      } as RSSItem & { _fullContent?: string; _author?: string });
    }
  } catch (err) {
    log(`  ${RED}✗${RESET} WP API fetch failed: ${err instanceof Error ? err.message : err}`);
  }

  return items.slice(0, limit);
}

/**
 * Fetch articles from Sunday Times edition-based RSS feeds.
 * The site publishes weekly editions with URLs like /YYMMDD/section/feed/section.xml
 */
async function fetchSundayTimesEdition(sections: string[], limit: number): Promise<RSSItem[]> {
  const items: RSSItem[] = [];
  const seen = new Set<string>();

  // Try recent Sundays (last 4 weeks)
  const now = new Date();
  const sundayDates: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay() - (i * 7)); // Previous Sundays
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    sundayDates.push(`${yy}${mm}${dd}`);
  }

  for (const dateStr of sundayDates) {
    for (const section of sections) {
      if (items.length >= limit) break;
      try {
        const feedUrl = `https://www.sundaytimes.lk/${dateStr}/${section}/feed/${section.replace('-', '_')}.xml`;
        const feedItems = await fetchRSS(feedUrl);
        for (const item of feedItems) {
          if (!seen.has(item.link)) {
            seen.add(item.link);
            items.push(item);
          }
        }
      } catch {
        // Edition/section may not exist
      }
    }
  }

  return items.slice(0, limit);
}

/**
 * Fetch articles from Cloudflare-protected sites using Playwright.
 * Connects to the Docker Playwright service, loads the homepage,
 * extracts article links, then scrapes each article page.
 */
async function fetchPlaywrightArticles(
  sourceUrl: string,
  sourceSlug: string,
  limit: number
): Promise<RSSItemExtended[]> {
  const items: RSSItemExtended[] = [];
  let browser;

  try {
    browser = await chromium.connect(PLAYWRIGHT_WS, { timeout: 15000 });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Step 1: Scrape homepage for article links
    const page = await context.newPage();
    log(`  ${DIM}Playwright: loading ${sourceUrl}...${RESET}`);
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for Cloudflare challenge to resolve (up to 15s)
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(3000);
      const title = await page.title();
      if (!title.includes('Just a moment') && !title.includes('Checking')) break;
      log(`  ${DIM}Waiting for CF challenge... (${(i + 1) * 3}s)${RESET}`);
    }

    const links = await page.evaluate((baseUrl: string) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const articleLinks: Array<{ url: string; title: string }> = [];
      const seen = new Set<string>();

      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href;
        const text = a.textContent?.trim() || '';

        // Must be same domain and have reasonable title
        if (!href.startsWith(baseUrl) && !href.startsWith('/')) continue;
        if (text.length < 10 || text.length > 300) continue;
        if (seen.has(href)) continue;
        // Must look like an article path (enough segments)
        if (href.split('/').filter(Boolean).length < 4) continue;
        // Skip navigation/category/media links
        if (/\/(category|tag|page|author|wp-content|feed|login)\//i.test(href)) continue;
        if (/\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(href)) continue;

        seen.add(href);
        articleLinks.push({ url: href, title: text });
      }
      return articleLinks;
    }, sourceUrl);

    await page.close();
    log(`  ${GREEN}✓${RESET} Playwright: found ${links.length} article links`);

    // Step 2: Scrape each article page
    for (const link of links.slice(0, limit * 2)) {
      if (items.length >= limit) break;

      try {
        const articlePage = await context.newPage();
        await articlePage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await articlePage.waitForTimeout(2000);

        const result = await articlePage.evaluate(() => {
          // Try article content selectors
          const contentSelectors = [
            'article .entry-content', '.article-content', '.story-text',
            '.inner-content', '.entry-content', '.post-content',
            '.content-area', '#article-body', 'article', 'main .content',
          ];

          let content = '';
          for (const sel of contentSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent && el.textContent.trim().length > 200) {
              content = el.textContent.trim();
              break;
            }
          }
          if (!content) {
            content = document.body?.textContent?.trim() || '';
          }

          const title =
            document.querySelector('h1.entry-title')?.textContent?.trim() ||
            document.querySelector('h1')?.textContent?.trim() ||
            document.querySelector('title')?.textContent?.trim() || '';

          const imageUrl =
            (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content ||
            (document.querySelector('article img') as HTMLImageElement)?.src || null;

          // Try to extract date from meta tags or time elements
          const dateStr =
            (document.querySelector('meta[property="article:published_time"]') as HTMLMetaElement)?.content ||
            (document.querySelector('time[datetime]') as HTMLTimeElement)?.dateTime ||
            (document.querySelector('.date, .post-date, .entry-date')?.textContent?.trim()) || null;

          // Try to extract author
          const author =
            (document.querySelector('meta[name="author"]') as HTMLMetaElement)?.content ||
            (document.querySelector('.author-name, .byline, [rel="author"]')?.textContent?.trim()) || null;

          return { title, content, imageUrl, dateStr, author };
        });

        await articlePage.close();

        if (!result.content || result.content.length < 200) continue;

        // Date extraction waterfall
        let pubDate: string | null = null;
        if (result.dateStr) {
          try {
            const d = new Date(result.dateStr);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) pubDate = d.toISOString();
          } catch {}
          if (!pubDate) pubDate = extractDateFromText(result.dateStr);
        }
        // URL pattern fallback
        if (!pubDate) {
          const urlMatch = link.url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
          if (urlMatch) {
            const d = new Date(`${urlMatch[1]}-${urlMatch[2]}-${urlMatch[3]}T00:00:00+05:30`);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) pubDate = d.toISOString();
          }
        }
        // Body text fallback
        if (!pubDate) pubDate = extractDateFromText(result.content.slice(0, 3000));

        const normContent = normalizeText(result.content);
        const normTitle = normalizeText(result.title || link.title);
        const normAuthor = result.author ? normalizeText(result.author) : null;

        items.push({
          title: normTitle,
          link: link.url,
          pubDate,
          description: normContent.slice(0, 500),
          imageUrl: result.imageUrl,
          _fullContent: normContent,
          _author: normAuthor,
        });

        log(`  ${GREEN}✓${RESET} ${normTitle.slice(0, 55)}... (${normContent.length} chars${pubDate ? '' : ', NO DATE'})`);
      } catch {
        log(`  ${RED}✗${RESET} Failed: ${link.title.slice(0, 50)}...`);
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    await browser.close();
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    log(`  ${RED}✗${RESET} Playwright error: ${err instanceof Error ? err.message : err}`);
  }

  return items.slice(0, limit);
}

// Extend RSSItem to carry optional pre-fetched content
interface RSSItemExtended extends RSSItem {
  _fullContent?: string;
  _author?: string;
}

async function runIngest(limit: number): Promise<number> {
  log(`${BOLD}INGEST${RESET} — fetching articles from all active sources`);

  const { data: sources, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_active', true);

  if (error || !sources || sources.length === 0) {
    log(`${YELLOW}–${RESET} No active sources found`);
    return 0;
  }

  log(`Found ${sources.length} active sources`);
  let totalInserted = 0;
  let totalSkippedNoDate = 0;
  let totalSkippedDuplicate = 0;

  // Connect browser once for the entire ingest run
  let browser: Awaited<ReturnType<typeof chromium.connect>> | null = null;
  try {
    browser = await chromium.connect(PLAYWRIGHT_WS, { timeout: 15000 });
    log(`${GREEN}✓${RESET} Playwright connected`);
  } catch (err) {
    log(`${RED}✗${RESET} Playwright connection failed: ${err instanceof Error ? err.message : err}`);
    log(`${YELLOW}–${RESET} Continuing without article page scraping (API sources only)`);
  }

  try {
    for (const source of sources) {
      log(`${DIM}Source: ${source.name} (${source.slug})${RESET}`);

      const config = (source.scrape_config || {}) as ScrapeConfig;
      const method = config.method;

      let rssItems: RSSItemExtended[] = [];
      let skipScrape = false; // For API sources that already have full content

      // Route to appropriate ingestion method based on scrape_config
      if (method === 'newsfirst_api' && config.api_url) {
        try {
          rssItems = await fetchNewsfirstAPI(config.api_url, limit);
          skipScrape = true;
          if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} News 1st API: ${rssItems.length} articles`);
        } catch (err) {
          log(`  ${RED}✗${RESET} News 1st API failed: ${err instanceof Error ? err.message : err}`);
        }
      } else if (method === 'wp_api' && config.api_url) {
        try {
          rssItems = await fetchWordPressAPI(config.api_url, limit);
          skipScrape = true;
          if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} WP API: ${rssItems.length} articles`);
        } catch (err) {
          log(`  ${RED}✗${RESET} WP API failed: ${err instanceof Error ? err.message : err}`);
        }
      } else if (method === 'edition_rss' && config.edition_sections) {
        try {
          rssItems = await fetchSundayTimesEdition(config.edition_sections, limit);
          if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} Edition RSS: ${rssItems.length} articles`);
        } catch (err) {
          log(`  ${RED}✗${RESET} Edition RSS failed: ${err instanceof Error ? err.message : err}`);
        }
      } else if (method === 'playwright') {
        // Cloudflare-protected sources — scrape homepage for links via Playwright
        try {
          rssItems = await fetchPlaywrightArticles(source.url, source.slug, limit);
          skipScrape = true; // fetchPlaywrightArticles already scrapes each article page
          if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} Playwright homepage: ${rssItems.length} articles`);
        } catch (err) {
          log(`  ${RED}✗${RESET} Playwright failed: ${err instanceof Error ? err.message : err}`);
        }
      } else {
        // Standard RSS + listing page fallback
        if (source.rss_url) {
          try {
            rssItems = await fetchRSS(source.rss_url);
          } catch (err) {
            log(`  ${RED}✗${RESET} RSS fetch failed: ${err instanceof Error ? err.message : err}`);
          }
        }

        if (rssItems.length === 0) {
          log(`  ${YELLOW}–${RESET} RSS empty/failed, trying listing page scrape...`);
          rssItems = await scrapeListingPage(browser, source.url, source.slug, limit);
          if (rssItems.length > 0) {
            log(`  ${GREEN}✓${RESET} Listing page fallback: found ${rssItems.length} article links`);
          } else {
            log(`  ${YELLOW}–${RESET} No articles found from listing page either`);
            continue;
          }
        }
      }

      if (rssItems.length === 0) continue;

      // --- Deduplicate against existing URLs AND recent titles ---
      const urls = rssItems.slice(0, limit).map(i => i.link);

      // Query 1: Check which URLs already exist for this source
      const { data: existingByUrl } = await supabase
        .from('articles')
        .select('url')
        .eq('source_id', source.id)
        .in('url', urls);

      // Query 2: Get recent titles for title-based dedup (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recentArticles } = await supabase
        .from('articles')
        .select('title')
        .eq('source_id', source.id)
        .gte('created_at', sevenDaysAgo);

      const existingUrls = new Set((existingByUrl || []).map(a => a.url));
      const existingTitles = new Set(
        (recentArticles || []).map(a => normalizeTitle(a.title || ''))
          .filter(t => t.length > 10) // Only meaningful titles
      );

      // Create browser context for this source (shared across articles)
      let context: any = null;
      if (browser && !skipScrape) {
        try {
          context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          });
        } catch (err) {
          log(`  ${RED}✗${RESET} Browser context failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      let inserted = 0;
      let skippedNoDate = 0;
      let skippedDuplicate = 0;

      try {
        for (const item of rssItems.slice(0, limit) as RSSItemExtended[]) {
          // URL deduplication
          if (existingUrls.has(item.link)) continue;

          // Title deduplication (catches same article at different URLs)
          const normTitle = normalizeTitle(item.title);
          if (normTitle.length > 10 && existingTitles.has(normTitle)) {
            skippedDuplicate++;
            continue;
          }

          // Skip known non-article URLs
          if (
            /\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(item.link) ||
            /\/feed\/?$/.test(item.link) ||
            /\/print\/?$/.test(item.link) ||
            /\/wp-content\/uploads\//.test(item.link) ||
            /\/(category|tag|author|page)\//.test(item.link) ||
            /\/(hot-news|news_archive|sports|entertainment-news)\/?$/i.test(item.link) ||
            /\?mode=(beauti|head)/.test(item.link)
          ) continue;

          let articleTitle: string;
          let content: string;
          let excerpt: string | null;
          let publishedAt: string | null = null;
          let author: string | null = null;
          let imageUrl: string | null = item.imageUrl;

          if (skipScrape && item._fullContent) {
            // API sources already have full content — no page scraping needed
            articleTitle = normalizeText(item.title);
            content = normalizeText(item._fullContent);
            excerpt = content.slice(0, 300);
            author = item._author ? normalizeText(item._author) : null;

            if (item.pubDate) {
              try { publishedAt = new Date(item.pubDate).toISOString(); } catch {}
            }
          } else if (context) {
            // Scrape article page with Playwright
            const scraped = await scrapeArticlePage(context, item.link, config, item.pubDate);
            if (!scraped || scraped.content.length < 200) {
              log(`  ${RED}✗${RESET} ${item.title.slice(0, 50)}... (scrape failed or too short)`);
              continue;
            }

            articleTitle = scraped.title || normalizeText(item.title);
            content = scraped.content;
            author = scraped.author;
            publishedAt = scraped.publishedTime;
            imageUrl = scraped.imageUrl || imageUrl;

            excerpt = extractExcerpt(content) || content.slice(0, 300);
          } else {
            // No browser available — can only use RSS data
            articleTitle = normalizeText(item.title);
            content = normalizeText(item.description?.replace(/<[^>]*>/g, '') || '');
            excerpt = content.slice(0, 300);

            if (item.pubDate) {
              try { publishedAt = new Date(item.pubDate).toISOString(); } catch {}
            }
          }

          // --- MANDATORY DATE CHECK ---
          if (!publishedAt) {
            skippedNoDate++;
            log(`  ${YELLOW}–${RESET} ${articleTitle.slice(0, 50)}... (NO DATE — skipped)`);
            continue;
          }

          if (content.length < 100) {
            log(`  ${RED}✗${RESET} ${articleTitle.slice(0, 50)}... (content too short: ${content.length} chars)`);
            continue;
          }

          const { error: insertErr } = await supabase.from('articles').insert({
            source_id: source.id,
            url: item.link,
            title: articleTitle,
            content,
            excerpt,
            image_url: imageUrl,
            published_at: publishedAt,
            author,
            language: source.language,
            original_language: source.language,
            is_processed: false,
          });

          if (insertErr) {
            if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
              skippedDuplicate++;
            } else {
              log(`  ${RED}✗${RESET} ${articleTitle.slice(0, 50)}... (${insertErr.message})`);
            }
          } else {
            const methodLabel = skipScrape ? 'API' : 'PW';
            log(`  ${GREEN}✓${RESET} ${articleTitle.slice(0, 50)}... (${content.length} chars, ${methodLabel}${author ? ', ' + author : ''})`);
            inserted++;
            // Track this title to prevent intra-batch duplicates
            existingTitles.add(normTitle);
            existingUrls.add(item.link);
          }

          // Rate limit
          const delayMs = config.rateLimitMs || (skipScrape ? 500 : 2000);
          await new Promise(r => setTimeout(r, delayMs));
        }
      } finally {
        // Ensure browser context is always cleaned up
        if (context) await context.close().catch(() => {});
      }

      if (inserted > 0) {
        log(`  ${GREEN}▸${RESET} ${source.name}: ${inserted} new articles`);
      }
      if (skippedNoDate > 0) {
        log(`  ${YELLOW}▸${RESET} ${source.name}: ${skippedNoDate} skipped (no date)`);
      }
      if (skippedDuplicate > 0) {
        log(`  ${DIM}▸ ${source.name}: ${skippedDuplicate} skipped (duplicate)${RESET}`);
      }
      totalInserted += inserted;
      totalSkippedNoDate += skippedNoDate;
      totalSkippedDuplicate += skippedDuplicate;
    }
  } finally {
    // Ensure browser cleanup even on errors
    if (browser) await browser.close().catch(() => {});
  }

  log(`${GREEN}▸${RESET} Ingest complete: ${totalInserted} inserted, ${totalSkippedNoDate} skipped (no date), ${totalSkippedDuplicate} skipped (duplicate)`);
  return totalInserted;
}

// ===========================================================================
// STEP 2: ENRICH (uses lib/enrichment/ modular service)
// ===========================================================================

import { EnrichmentService } from '../lib/enrichment';
import type { LLMClientConfig, EmbeddingConfig as EnrichEmbeddingConfig } from '../lib/enrichment';

function buildEnrichmentConfigs(): { llm: LLMClientConfig; embedding: EnrichEmbeddingConfig } {
  return {
    llm: {
      provider: llmProvider,
      openrouterKey,
      openrouterModel,
      ollamaUrl,
      ollamaModel: ollamaLlmModel,
    },
    embedding: {
      ollamaUrl,
      model: embeddingModel,
      dimensions: embeddingDims,
    },
  };
}

async function runEnrich(limit: number): Promise<number> {
  const llmLabel = llmProvider === 'ollama' ? `${ollamaLlmModel} via Ollama` : `${openrouterModel} via OpenRouter`;
  log(`${BOLD}ENRICH${RESET} — LLM: ${llmLabel}, Embedding: ${embeddingModel}`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, source_id, published_at, url, language')
    .is('ai_enriched_at', null)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !articles || articles.length === 0) {
    log(`${YELLOW}–${RESET} No unenriched articles found`);
    return 0;
  }

  log(`Found ${articles.length} unenriched articles`);
  let enriched = 0;
  let qualitySkipped = 0;

  const configs = buildEnrichmentConfigs();
  const enrichmentService = new EnrichmentService(supabase, configs.llm, configs.embedding);

  for (const article of articles) {
    // Quality gate: skip articles with too-short content (likely non-article pages)
    if ((article.content?.length || 0) < 500) {
      log(`  ${YELLOW}–${RESET} Skip (short content: ${article.content?.length || 0} chars): ${article.title.slice(0, 50)}`);
      qualitySkipped++;
      continue;
    }

    // Quality gate: skip known non-article URL patterns
    const url = article.url || '';
    if (
      /\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(url) ||
      /\/feed\/?$/.test(url) ||
      /\/print\/?$/.test(url) ||
      /\/wp-content\//.test(url)
    ) {
      log(`  ${YELLOW}–${RESET} Skip (non-article URL): ${url.slice(0, 60)}`);
      qualitySkipped++;
      continue;
    }

    log(`${DIM}Processing: ${article.title.slice(0, 55)}...${RESET}`);

    // Unified enrichment: analysis + entities + translation + embedding
    const result = await enrichmentService.enrichArticle({
      id: article.id,
      title: article.title,
      content: article.content!,
      source_id: article.source_id,
      url: article.url,
      published_at: article.published_at,
      language: article.language,
    });

    if (!result) {
      log(`  ${RED}✗${RESET} Enrichment failed`);
      continue;
    }

    if (!result.embedding) {
      log(`  ${RED}✗${RESET} Embedding failed`);
      continue;
    }

    log(`  ${GREEN}✓${RESET} Lang: ${result.detected_language}, Type: ${result.article_type}, Bias: ${result.bias_score}, Tags: ${result.tags.length}`);

    // Update DB with all enriched fields
    const updateFields: Record<string, unknown> = {
      summary: result.summary,
      topics: result.election_info
        ? [...new Set([...result.topics, 'election'])]
        : result.topics,
      ai_bias_score: result.bias_score,
      ai_sentiment: result.sentiment,
      ai_enriched_at: new Date().toISOString(),
      is_processed: true,
      embedding: `[${result.embedding.join(',')}]`,
      language: result.detected_language,
      // New fields
      key_people: result.key_people,
      key_quotes: result.key_quotes,
      article_type: result.article_type,
      reading_time: result.reading_time,
      casualties: result.casualties,
      monetary_amounts: result.monetary_amounts,
    };

    // Translation fields (only set if generated)
    if (result.title_si) updateFields.title_si = result.title_si;
    if (result.title_en) updateFields.title_en = result.title_en;
    if (result.summary_si) updateFields.summary_si = result.summary_si;
    if (result.summary_en) updateFields.summary_en = result.summary_en;

    const { error: updateErr } = await supabase
      .from('articles')
      .update(updateFields)
      .eq('id', article.id);

    if (updateErr) {
      log(`  ${RED}✗${RESET} DB update failed: ${updateErr.message}`);
    } else {
      enriched++;
      log(`  ${GREEN}✓${RESET} Enriched & saved (${result.tags.length} tags, ${result.key_people.length} people)`);

      // Log details
      if (result.crime_type) log(`    ${DIM}Crime: ${result.crime_type}${RESET}`);
      if (result.locations.length > 0) log(`    ${DIM}Locations: ${result.locations.join(', ')}${RESET}`);
      if (result.key_people.length > 0) log(`    ${DIM}People: ${result.key_people.join(', ')}${RESET}`);
      if (result.casualties) log(`    ${DIM}Casualties: ${result.casualties.deaths} dead, ${result.casualties.injuries} injured${RESET}`);
      if (result.monetary_amounts.length > 0) log(`    ${DIM}Amounts: ${result.monetary_amounts.map(m => `${m.currency} ${m.amount}`).join(', ')}${RESET}`);
      if (result.title_si || result.title_en) log(`    ${DIM}Translated to ${result.title_si ? 'SI' : 'EN'}${RESET}`);

      if (result.election_info) {
        log(`    ${DIM}Election: ${result.election_info.type} in ${result.election_info.constituency || 'N/A'}${result.election_info.result ? ' (' + result.election_info.result + ')' : ''}${RESET}`);
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  if (qualitySkipped > 0) {
    log(`${YELLOW}–${RESET} Quality gate skipped: ${qualitySkipped} articles (short content or non-article URL)`);
  }
  log(`${GREEN}▸${RESET} Enrich complete: ${enriched}/${articles.length} articles enriched`);
  return enriched;
}

// ===========================================================================
// STEP 3: CLUSTER
// ===========================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rx = this.find(x), ry = this.find(y);
    if (rx === ry) return;
    const rX = this.rank.get(rx)!, rY = this.rank.get(ry)!;
    if (rX < rY) this.parent.set(rx, ry);
    else if (rX > rY) this.parent.set(ry, rx);
    else { this.parent.set(ry, rx); this.rank.set(rx, rX + 1); }
  }

  getClusters(): Map<string, string[]> {
    const clusters = new Map<string, string[]>();
    for (const [node] of this.parent) {
      const root = this.find(node);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(node);
    }
    return clusters;
  }
}

async function runCluster(threshold: number): Promise<number> {
  log(`${BOLD}CLUSTER${RESET} — grouping articles into stories (threshold: ${threshold})`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, source_id, published_at, embedding')
    .not('embedding', 'is', null)
    .is('story_id', null)
    .order('published_at', { ascending: false });

  if (error || !articles || articles.length < 2) {
    log(`${YELLOW}–${RESET} Not enough unclustered articles (${articles?.length || 0})`);
    return 0;
  }

  log(`Found ${articles.length} unclustered articles with embeddings`);

  // Parse embeddings
  const parsed: Array<{ id: string; title: string; source_id: string; embedding: number[] }> = [];
  for (const a of articles) {
    try {
      const vec = typeof a.embedding === 'string' ? JSON.parse(a.embedding) : a.embedding;
      if (Array.isArray(vec)) parsed.push({ id: a.id, title: a.title, source_id: a.source_id, embedding: vec });
    } catch {}
  }

  // Pairwise similarity + union-find
  const uf = new UnionFind();
  let pairCount = 0;

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      if (cosineSimilarity(parsed[i].embedding, parsed[j].embedding) >= threshold) {
        uf.union(parsed[i].id, parsed[j].id);
        pairCount++;
      }
    }
  }

  log(`Found ${pairCount} similar pairs`);

  // Get clusters with 2+ articles
  const storyClusters = [...uf.getClusters().entries()].filter(([, m]) => m.length >= 2);

  if (storyClusters.length === 0) {
    log(`${YELLOW}–${RESET} No new clusters found`);
    return 0;
  }

  // Get source info for bias distribution
  const { data: sources } = await supabase.from('sources').select('id, name, bias_score');
  const sourceMap = new Map((sources || []).map(s => [s.id, s]));

  let storiesCreated = 0;

  for (const [, memberIds] of storyClusters) {
    const clusterArticles = memberIds.map(id => parsed.find(p => p.id === id)!);
    const seedArticle = clusterArticles[0];
    const clusterSources = [...new Set(clusterArticles.map(a => a.source_id))];

    let left = 0, center = 0, right = 0;
    for (const sid of clusterSources) {
      const bias = sourceMap.get(sid)?.bias_score || 0;
      if (bias < -0.3) left++;
      else if (bias > 0.3) right++;
      else center++;
    }

    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .insert({
        title: seedArticle.title,
        article_count: memberIds.length,
        source_count: clusterSources.length,
        bias_distribution: { left, center, right },
        is_active: true,
      })
      .select()
      .single();

    if (storyErr || !story) {
      log(`  ${RED}✗${RESET} Failed to create story: ${storyErr?.message}`);
      continue;
    }

    for (const articleId of memberIds) {
      await supabase.from('articles').update({ story_id: story.id }).eq('id', articleId);
      await supabase.from('story_articles').insert({
        story_id: story.id,
        article_id: articleId,
        is_seed_article: articleId === seedArticle.id,
      });
    }

    const sourceNames = clusterSources.map(id => sourceMap.get(id)?.name || '?').join(', ');
    log(`  ${GREEN}✓${RESET} "${seedArticle.title.slice(0, 50)}..." (${memberIds.length} articles from ${sourceNames})`);
    storiesCreated++;
  }

  log(`${GREEN}▸${RESET} Cluster complete: ${storiesCreated} stories created`);
  return storiesCreated;
}

// ===========================================================================
// STEP 4: GRAPH (Graphiti knowledge graph)
// ===========================================================================

// Note: slugify() and extractEntitiesFromContent() have been moved to lib/enrichment/
// Entity extraction now happens in the unified enrich stage, not the graph stage.

async function runGraph(limit: number): Promise<number> {
  log(`${BOLD}GRAPH${RESET} — syncing enriched articles to Graphiti knowledge graph`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, summary, content, source_id, published_at')
    .not('ai_enriched_at', 'is', null)
    .is('graphiti_synced_at', null)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !articles || articles.length === 0) {
    log(`${YELLOW}–${RESET} No articles pending Graphiti sync`);
    return 0;
  }

  // Get source names for descriptions
  const sourceIds = [...new Set(articles.map(a => a.source_id))];
  const { data: sources } = await supabase
    .from('sources')
    .select('id, name')
    .in('id', sourceIds);
  const sourceMap = new Map((sources || []).map(s => [s.id, s.name]));

  log(`Found ${articles.length} articles to sync`);
  let synced = 0;

  for (const article of articles) {
    log(`${DIM}Graphiti: ${article.title.slice(0, 55)}...${RESET}`);

    const episodeContent = [
      article.summary || '',
      '',
      (article.content || '').slice(0, 4000),
    ].join('\n').trim();

    const sourceName = sourceMap.get(article.source_id) || 'Unknown';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(`${graphitiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: article.source_id,
          messages: [{
            uuid: article.id,
            name: article.title,
            role: 'user',
            role_type: 'user',
            content: episodeContent,
            source_description: `News article from ${sourceName}`,
            timestamp: article.published_at || new Date().toISOString(),
          }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        log(`  ${RED}✗${RESET} Graphiti API error ${res.status}: ${errBody.slice(0, 100)}`);
        continue;
      }

      log(`  ${GREEN}✓${RESET} Synced to knowledge graph`);

      // Entity extraction now happens in the unified enrich stage (lib/enrichment/)

      // Mark as synced
      const { error: updateErr } = await supabase
        .from('articles')
        .update({ graphiti_synced_at: new Date().toISOString() })
        .eq('id', article.id);

      if (updateErr) {
        log(`  ${RED}✗${RESET} DB update failed: ${updateErr.message}`);
      } else {
        synced++;
      }
    } catch (err) {
      log(`  ${RED}✗${RESET} ${err instanceof Error ? err.message : err}`);
    }

    // Graphiti does heavy LLM processing per episode — pace requests
    await new Promise(r => setTimeout(r, 2000));
  }

  log(`${GREEN}▸${RESET} Graph sync complete: ${synced}/${articles.length} articles synced`);
  return synced;
}

// ===========================================================================
// FULL PIPELINE
// ===========================================================================

async function runAll(limit: number, threshold: number) {
  log(`${BOLD}${GREEN}▸ FULL PIPELINE${RESET}`);
  console.log();

  const ingested = await runIngest(limit);
  console.log();

  if (ingested > 0) {
    await runEnrich(limit);
  } else {
    // Still try enriching — there may be unenriched articles from previous runs
    await runEnrich(limit);
  }
  console.log();

  await runGraph(limit);
  console.log();

  await runCluster(threshold);
  console.log();

  log(`${GREEN}▸ Pipeline complete${RESET}`);
}

// ===========================================================================
// DAEMON MODE
// ===========================================================================

function runDaemon(limit: number, threshold: number) {
  const INGEST_INTERVAL = 2 * 60 * 60 * 1000;  // 2 hours
  const ENRICH_INTERVAL = 3 * 60 * 60 * 1000;  // 3 hours
  const CLUSTER_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

  log(`${BOLD}${GREEN}▸ DAEMON MODE${RESET}`);
  log(`  Ingest:  every 2h`);
  log(`  Enrich:  every 3h`);
  log(`  Cluster: every 6h`);
  log(`  Press Ctrl+C to stop\n`);

  // Run full pipeline immediately on start
  runAll(limit, threshold).catch(err => log(`${RED}Pipeline error: ${err.message}${RESET}`));

  // Schedule recurring runs
  setInterval(async () => {
    try {
      log(`${DIM}--- Scheduled ingest ---${RESET}`);
      const ingested = await runIngest(limit);
      if (ingested > 0) {
        log(`${DIM}--- Auto-triggering enrich ---${RESET}`);
        await runEnrich(limit);
        log(`${DIM}--- Auto-triggering graph sync ---${RESET}`);
        await runGraph(limit);
        log(`${DIM}--- Auto-triggering cluster ---${RESET}`);
        await runCluster(threshold);
      }
    } catch (err) {
      log(`${RED}Ingest cycle error: ${err instanceof Error ? err.message : err}${RESET}`);
    }
  }, INGEST_INTERVAL);

  // Independent enrich cycle (catches any missed articles)
  setInterval(async () => {
    try {
      log(`${DIM}--- Scheduled enrich ---${RESET}`);
      await runEnrich(limit);
    } catch (err) {
      log(`${RED}Enrich cycle error: ${err instanceof Error ? err.message : err}${RESET}`);
    }
  }, ENRICH_INTERVAL);

  // Independent cluster cycle
  setInterval(async () => {
    try {
      log(`${DIM}--- Scheduled cluster ---${RESET}`);
      await runCluster(threshold);
    } catch (err) {
      log(`${RED}Cluster cycle error: ${err instanceof Error ? err.message : err}${RESET}`);
    }
  }, CLUSTER_INTERVAL);
}

// ===========================================================================
// CLI
// ===========================================================================

async function main() {
  const args = process.argv.slice(2);
  let limit = 20;
  let threshold = 0.80;
  let mode: 'ingest' | 'enrich' | 'graph' | 'cluster' | 'all' | 'daemon' | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ingest') mode = 'ingest';
    if (args[i] === '--enrich') mode = 'enrich';
    if (args[i] === '--graph') mode = 'graph';
    if (args[i] === '--cluster') mode = 'cluster';
    if (args[i] === '--all') mode = 'all';
    if (args[i] === '--daemon') mode = 'daemon';
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--threshold' && args[i + 1]) threshold = parseFloat(args[++i]);
    if (args[i] === '--llm' && args[i + 1]) {
      const val = args[++i].toLowerCase();
      if (val === 'ollama' || val === 'openrouter') llmProvider = val;
    }
  }

  if (!mode) {
    console.log(`
${GREEN}▸${RESET} News Pipeline Orchestrator

${BOLD}Usage:${RESET}
  npx tsx scripts/pipeline.ts --ingest             Ingest from all active RSS sources
  npx tsx scripts/pipeline.ts --enrich             Enrich unenriched articles (LLM + embeddings)
  npx tsx scripts/pipeline.ts --graph              Sync enriched articles to Graphiti knowledge graph
  npx tsx scripts/pipeline.ts --cluster            Cluster articles into stories
  npx tsx scripts/pipeline.ts --all                Run full pipeline (ingest → enrich → graph → cluster)
  npx tsx scripts/pipeline.ts --daemon             Run on schedule (2h/3h/6h intervals)

${BOLD}Options:${RESET}
  --limit N        Max articles per source/batch (default: 20)
  --threshold N    Cosine similarity threshold (default: 0.80)
  --llm ollama     Use Ollama (${ollamaLlmModel}) for LLM analysis
  --llm openrouter Use OpenRouter (${openrouterModel}) — default
`);
    return;
  }

  console.log();

  switch (mode) {
    case 'ingest':
      await runIngest(limit);
      break;
    case 'enrich':
      await runEnrich(limit);
      break;
    case 'graph':
      await runGraph(limit);
      break;
    case 'cluster':
      await runCluster(threshold);
      break;
    case 'all':
      await runAll(limit, threshold);
      break;
    case 'daemon':
      runDaemon(limit, threshold);
      return; // Don't exit — daemon runs forever
  }
}

main().catch((err) => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
