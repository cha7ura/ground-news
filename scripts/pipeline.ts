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
const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';
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

  return null;
}

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

    // Extract date: try metadata fields first
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
    // Fallback: URL path date pattern (e.g. /2026/02/04/)
    if (!publishedTime) {
      const urlMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (urlMatch) {
        publishedTime = `${urlMatch[1]}-${urlMatch[2]}-${urlMatch[3]}T00:00:00+05:30`;
      }
    }
    // Fallback: extract date from page text (for sites like Ada Derana with no meta tags)
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
 * Scrape article links from a source's listing page (fallback when RSS is broken).
 * Returns a list of {link, title} extracted from anchor tags in the page HTML.
 */
async function scrapeListingPage(sourceUrl: string, sourceSlug: string, limit: number): Promise<RSSItem[]> {
  // Source-specific listing page URLs
  let listingUrl = sourceUrl;
  if (sourceSlug === 'ada-derana-si') {
    listingUrl = 'https://sinhala.adaderana.lk/';  // hot-news/ returns 404 for Sinhala
  } else if (sourceSlug === 'ada-derana-en') {
    listingUrl = 'https://www.adaderana.lk/hot-news/';
  }

  try {
    const scraped = await scrapeArticle(listingUrl);
    if (!scraped || !scraped.markdown) return [];

    const items: RSSItem[] = [];
    const seen = new Set<string>();

    // Strategy 1: Extract markdown links [title](url) — works for most sites
    const linkRe = /\[([^\]]{5,})\]\((https?:\/\/[^)]+)\)/g;
    let m: RegExpExecArray | null;

    while ((m = linkRe.exec(scraped.markdown)) !== null && items.length < limit) {
      const title = m[1].trim();
      let link = m[2].trim();

      // Only keep article-looking URLs from the same domain
      if (!link.includes('adaderana.lk')) continue;
      if (!/\/news[/.]/.test(link) && !/\/sports[/.]/.test(link)) continue;
      if (/\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(link)) continue;
      // Skip generic links like "වැඩි විස්තර" (more details), "Comments"
      if (/^(වැඩි විස්තර|more|comments|\(\d+\))/i.test(title)) continue;

      // Normalize: strip URL-encoded slug, keep base /news/ID
      link = link.replace(/^http:/, 'https:');
      const baseMatch = link.match(/(https:\/\/[^/]+\/news\/\d+)/);
      if (baseMatch) link = baseMatch[1];

      if (seen.has(link)) continue;
      seen.add(link);

      items.push({ title, link, pubDate: null, description: null, imageUrl: null });
    }

    // Strategy 2: Raw URL extraction fallback (for pages where markdown link titles are missing)
    if (items.length === 0) {
      const urlPatterns = [
        /https?:\/\/sinhala\.adaderana\.lk\/news\/\d+/g,
        /https?:\/\/(?:www\.)?adaderana\.lk\/news(?:\.php\?nid=|\/)\d+/g,
      ];
      for (const pattern of urlPatterns) {
        let um: RegExpExecArray | null;
        while ((um = pattern.exec(scraped.markdown)) !== null && items.length < limit) {
          let link = um[0].replace(/^http:/, 'https:');
          if (seen.has(link)) continue;
          seen.add(link);
          items.push({ title: 'Untitled', link, pubDate: null, description: null, imageUrl: null });
        }
      }
    }

    return items;
  } catch {
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

        let pubDate: string | null = null;
        if (result.dateStr) {
          try { pubDate = new Date(result.dateStr).toISOString(); } catch {}
        }

        items.push({
          title: result.title || link.title,
          link: link.url,
          pubDate,
          description: result.content.slice(0, 500),
          imageUrl: result.imageUrl,
          _fullContent: result.content,
          _author: result.author,
        });

        log(`  ${GREEN}✓${RESET} ${(result.title || link.title).slice(0, 55)}... (${result.content.length} chars)`);
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

  for (const source of sources) {
    log(`${DIM}Source: ${source.name} (${source.slug})${RESET}`);

    const config = (source.scrape_config || {}) as Record<string, unknown>;
    const method = config.method as string | undefined;

    let rssItems: RSSItemExtended[] = [];
    let usedFallback = false;
    let skipScrape = false; // For API sources that already have full content

    // Route to appropriate ingestion method based on scrape_config
    if (method === 'newsfirst_api' && config.api_url) {
      try {
        rssItems = await fetchNewsfirstAPI(config.api_url as string, limit);
        skipScrape = true;
        if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} News 1st API: ${rssItems.length} articles`);
      } catch (err) {
        log(`  ${RED}✗${RESET} News 1st API failed: ${err instanceof Error ? err.message : err}`);
      }
    } else if (method === 'wp_api' && config.api_url) {
      try {
        rssItems = await fetchWordPressAPI(config.api_url as string, limit);
        skipScrape = true;
        if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} WP API: ${rssItems.length} articles`);
      } catch (err) {
        log(`  ${RED}✗${RESET} WP API failed: ${err instanceof Error ? err.message : err}`);
      }
    } else if (method === 'edition_rss' && config.edition_sections) {
      try {
        rssItems = await fetchSundayTimesEdition(config.edition_sections as string[], limit);
        if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} Edition RSS: ${rssItems.length} articles`);
      } catch (err) {
        log(`  ${RED}✗${RESET} Edition RSS failed: ${err instanceof Error ? err.message : err}`);
      }
    } else if (method === 'playwright') {
      // Cloudflare-protected sources — use Playwright Docker service
      try {
        rssItems = await fetchPlaywrightArticles(source.url, source.slug, limit);
        skipScrape = true; // Content already extracted by Playwright
        if (rssItems.length > 0) log(`  ${GREEN}✓${RESET} Playwright: ${rssItems.length} articles scraped`);
      } catch (err) {
        log(`  ${RED}✗${RESET} Playwright failed: ${err instanceof Error ? err.message : err}`);
      }
    } else {
      // Standard RSS + fallback approach
      if (source.rss_url) {
        try {
          rssItems = await fetchRSS(source.rss_url);
        } catch (err) {
          log(`  ${RED}✗${RESET} RSS fetch failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      if (rssItems.length === 0) {
        log(`  ${YELLOW}–${RESET} RSS empty/failed, trying listing page scrape...`);
        rssItems = await scrapeListingPage(source.url, source.slug, limit);
        if (rssItems.length > 0) {
          log(`  ${GREEN}✓${RESET} Listing page fallback: found ${rssItems.length} article links`);
          usedFallback = true;
        } else {
          log(`  ${YELLOW}–${RESET} No articles found from listing page either`);
          continue;
        }
      }
    }

    if (rssItems.length === 0) continue;

    // Deduplicate against existing URLs
    const urls = rssItems.slice(0, limit).map(i => i.link);
    const { data: existing } = await supabase
      .from('articles')
      .select('url')
      .in('url', urls);
    const existingUrls = new Set((existing || []).map(a => a.url));

    let inserted = 0;
    for (const item of rssItems.slice(0, limit) as RSSItemExtended[]) {
      if (existingUrls.has(item.link)) continue;

      // Skip known non-article URLs (media files, feeds, listing/category pages)
      if (
        /\.(jpg|jpeg|png|gif|svg|webp|pdf)$/i.test(item.link) ||
        /\/feed\/?$/.test(item.link) ||
        /\/print\/?$/.test(item.link) ||
        /\/wp-content\/uploads\//.test(item.link) ||
        /\/index\.php$/.test(item.link) ||
        /\/hot-news\/?$/.test(item.link) ||
        /\/news_archive\.php/.test(item.link) ||
        /\/sports\.php$/.test(item.link) ||
        /\/sports-news\/?$/.test(item.link) ||
        /\/entertainment-news\/?$/.test(item.link) ||
        /\/more-entertainment-news\.php/.test(item.link) ||
        /\/moretechnews\.php/.test(item.link) ||
        /\/poll_results\.php/.test(item.link) ||
        /\/category\//.test(item.link) ||
        /\/tag\//.test(item.link) ||
        /\/author\//.test(item.link) ||
        /\/page\/\d+\/?$/.test(item.link) ||
        /\?mode=beauti/.test(item.link) ||
        /\?mode=head/.test(item.link)
      ) {
        log(`  ${YELLOW}–${RESET} Skip non-article URL: ${item.link.slice(0, 60)}`);
        continue;
      }

      let articleTitle: string;
      let content: string;
      let excerpt: string | null;
      let publishedAt: string | null = null;
      let author: string | null = null;
      let imageUrl: string | null = item.imageUrl;

      if (skipScrape && item._fullContent) {
        // API sources already have full content — no need to scrape
        articleTitle = item.title;
        content = item._fullContent;
        excerpt = content.slice(0, 300);
        author = item._author || null;

        if (item.pubDate) {
          try { publishedAt = new Date(item.pubDate).toISOString(); } catch {}
        }
      } else {
        // Standard scrape via Firecrawl
        const scraped = await scrapeArticle(item.link);
        if (!scraped || scraped.markdown.length < 200) {
          log(`  ${RED}✗${RESET} ${item.title.slice(0, 50)}... (scrape failed or too short)`);
          continue;
        }

        articleTitle = scraped.title || item.title;
        content = scraped.markdown;
        author = scraped.author || null;

        if (scraped.publishedTime) {
          try { publishedAt = new Date(scraped.publishedTime).toISOString(); } catch {}
        }
        if (!publishedAt && item.pubDate) {
          try { publishedAt = new Date(item.pubDate).toISOString(); } catch {}
        }

        const contentExcerpt = extractExcerpt(scraped.markdown);
        const rssExcerpt = item.description?.replace(/<[^>]*>/g, '').replace(/MORE\.\.$/, '').trim().slice(0, 300) || null;
        excerpt = contentExcerpt || rssExcerpt;
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
        log(`  ${RED}✗${RESET} ${articleTitle.slice(0, 50)}... (${insertErr.message})`);
      } else {
        const methodLabel = skipScrape ? 'API' : usedFallback ? 'listing' : 'RSS';
        log(`  ${GREEN}✓${RESET} ${articleTitle.slice(0, 50)}... (${content.length} chars, ${methodLabel}${publishedAt ? '' : ', NO DATE'}${author ? ', ' + author : ''})`);
        inserted++;
      }

      // Rate limit: API sources are faster, scrape sources need more delay
      await new Promise(r => setTimeout(r, skipScrape ? 500 : 2000));
    }

    if (inserted > 0) {
      log(`  ${GREEN}▸${RESET} ${source.name}: ${inserted} new articles`);
    }
    totalInserted += inserted;
  }

  log(`${GREEN}▸${RESET} Ingest complete: ${totalInserted} articles inserted`);
  return totalInserted;
}

// ===========================================================================
// STEP 2: ENRICH
// ===========================================================================

interface AnalysisResult {
  summary: string;
  topics: string[];
  bias_score: number;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  bias_indicators: string[];
  is_original_reporting: boolean;
  crime_type: string | null;
  locations: string[];
  law_enforcement: string[];
  police_station: string | null;
  political_party: string | null;
  election_info: {
    type: string;
    constituency: string;
    result: 'winner' | 'loser' | null;
    votes: string | null;
  } | null;
}

function buildAnalysisPrompt(title: string, content: string): string {
  return `Analyze this Sri Lankan news article for media bias and content.

Title: ${title}

Content:
${content.slice(0, 4000)}

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "summary": "2-sentence summary of the article",
  "topics": ["topic1", "topic2", "topic3"],
  "bias_score": 0.0,
  "sentiment": "neutral",
  "bias_indicators": ["indicator1"],
  "is_original_reporting": true,
  "crime_type": null,
  "locations": [],
  "law_enforcement": [],
  "police_station": null,
  "political_party": null,
  "election_info": null
}

Rules:
- bias_score: -1.0 (far left/opposition) to 1.0 (far right/government). 0.0 = neutral.
- sentiment: one of "positive", "negative", "neutral", "mixed"
- topics: 2-5 relevant topic keywords from: politics, economy, business, cricket, sports, tourism, education, health, crime, environment, technology, international, entertainment
- bias_indicators: specific phrases or framing choices that indicate bias (empty array if neutral)
- is_original_reporting: true if this appears to be original journalism, false if aggregated/wire service
- crime_type: if crime-related, one of: "drugs", "shooting", "murder", "robbery", "assault", "kidnapping", "fraud", "corruption", "smuggling", "sexual-assault", "arson", "human-trafficking". null if not crime.
- locations: array of specific Sri Lankan place names mentioned (cities, towns, districts). Example: ["Colombo", "Negombo", "Gampaha"]
- law_enforcement: array of law enforcement/military organizations involved. Example: ["Police", "Sri Lanka Army", "CID", "STF"]. Empty if none.
- police_station: specific police station or division mentioned (e.g. "Colombo Fort Police", "Kelaniya Police", "Mount Lavinia Police"). null if not mentioned.
- political_party: if a political party is mentioned, its name (e.g. "SLPP", "SJB", "UNP", "JVP/NPP", "SLFP"). null if none.
- election_info: if election-related, an object with: type ("presidential"/"parliamentary"/"provincial"/"local"), constituency (area/district), result ("winner"/"loser"/null), votes (vote count or percentage string, e.g. "52.25%" or "6,853,690"). null if not election-related.`;
}

function parseAnalysisResponse(responseText: string): AnalysisResult | null {
  if (!responseText) return null;

  // Strip thinking tags from qwen3 if present
  let cleaned = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as AnalysisResult;
  } catch {
    return null;
  }
}

async function analyzeWithOpenRouter(title: string, content: string): Promise<AnalysisResult | null> {
  const prompt = buildAnalysisPrompt(title, content);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: openrouterModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) return null;
    return parseAnalysisResponse(data.choices?.[0]?.message?.content?.trim() || '');
  } catch {
    return null;
  }
}

async function analyzeWithOllama(title: string, content: string): Promise<AnalysisResult | null> {
  const prompt = `/no_think\n${buildAnalysisPrompt(title, content)}`;

  try {
    const controller = new AbortController();
    // Ollama is slower — give it 120s
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${ollamaUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaLlmModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) return null;
    return parseAnalysisResponse(data.choices?.[0]?.message?.content?.trim() || '');
  } catch {
    return null;
  }
}

async function analyzeArticle(title: string, content: string): Promise<AnalysisResult | null> {
  if (llmProvider === 'ollama') {
    return analyzeWithOllama(title, content);
  }
  return analyzeWithOpenRouter(title, content);
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${ollamaUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: embeddingModel,
        input: text.slice(0, 8000),
        dimensions: embeddingDims,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = data.data?.[0]?.embedding;
    return embedding && embedding.length === embeddingDims ? embedding : null;
  } catch {
    return null;
  }
}

async function runEnrich(limit: number): Promise<number> {
  const llmLabel = llmProvider === 'ollama' ? `${ollamaLlmModel} via Ollama` : `${openrouterModel} via OpenRouter`;
  log(`${BOLD}ENRICH${RESET} — LLM: ${llmLabel}, Embedding: ${embeddingModel}`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, source_id, published_at, url')
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

    // LLM analysis
    const analysis = await analyzeArticle(article.title, article.content!);
    if (!analysis) {
      log(`  ${RED}✗${RESET} LLM analysis failed`);
      continue;
    }

    log(`  ${GREEN}✓${RESET} Bias: ${analysis.bias_score}, Sentiment: ${analysis.sentiment}`);

    await new Promise(r => setTimeout(r, 1000));

    // Embedding
    const embeddingInput = `${article.title}\n\n${article.content!.slice(0, 6000)}`;
    const embedding = await generateEmbedding(embeddingInput);

    if (!embedding) {
      log(`  ${RED}✗${RESET} Embedding failed`);
      continue;
    }

    // Update DB
    const { error: updateErr } = await supabase
      .from('articles')
      .update({
        summary: analysis.summary,
        topics: analysis.topics,
        ai_bias_score: analysis.bias_score,
        ai_sentiment: analysis.sentiment,
        ai_enriched_at: new Date().toISOString(),
        is_processed: true,
        embedding: `[${embedding.join(',')}]`,
      })
      .eq('id', article.id);

    if (updateErr) {
      log(`  ${RED}✗${RESET} DB update failed: ${updateErr.message}`);
    } else {
      log(`  ${GREEN}✓${RESET} Enriched & saved`);
      enriched++;

      // Tag with crime type if detected
      if (analysis.crime_type) {
        const crimeSlug = analysis.crime_type;
        const { data: crimeTag } = await supabase
          .from('tags')
          .upsert(
            { name: crimeSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), slug: crimeSlug, type: 'topic', is_active: true, created_by: 'ai' },
            { onConflict: 'slug' }
          )
          .select('id')
          .single();
        if (crimeTag) {
          await supabase.from('article_tags').upsert(
            { article_id: article.id, tag_id: crimeTag.id, confidence: 0.85, source: 'ai' },
            { onConflict: 'article_id,tag_id' }
          );
          log(`    ${DIM}Crime: ${crimeSlug}${RESET}`);
        }
      }

      // Tag with locations if detected
      if (analysis.locations && analysis.locations.length > 0) {
        for (const locName of analysis.locations.slice(0, 5)) {
          const locSlug = slugify(locName);
          if (!locSlug) continue;

          // Try to find matching Sri Lanka location for coordinates
          const { data: slLoc } = await supabase
            .from('sri_lanka_locations')
            .select('*')
            .eq('slug', locSlug)
            .maybeSingle();

          const { data: locTag } = await supabase
            .from('tags')
            .upsert(
              {
                name: locName,
                slug: locSlug,
                type: 'location',
                is_active: true,
                created_by: 'ai',
                ...(slLoc ? { latitude: slLoc.latitude, longitude: slLoc.longitude, district: slLoc.district, province: slLoc.province, name_si: slLoc.name_si } : {}),
              },
              { onConflict: 'slug' }
            )
            .select('id')
            .single();

          if (locTag) {
            await supabase.from('article_tags').upsert(
              { article_id: article.id, tag_id: locTag.id, confidence: 0.8, source: 'ai' },
              { onConflict: 'article_id,tag_id' }
            );
          }
        }
        log(`    ${DIM}Locations: ${analysis.locations.join(', ')}${RESET}`);
      }

      // Tag with law enforcement organizations
      if (analysis.law_enforcement && analysis.law_enforcement.length > 0) {
        for (const orgName of analysis.law_enforcement.slice(0, 3)) {
          const orgSlug = slugify(orgName);
          if (!orgSlug) continue;

          const { data: orgTag } = await supabase
            .from('tags')
            .upsert(
              { name: orgName, slug: orgSlug, type: 'organization', is_active: true, created_by: 'ai' },
              { onConflict: 'slug' }
            )
            .select('id')
            .single();

          if (orgTag) {
            await supabase.from('article_tags').upsert(
              { article_id: article.id, tag_id: orgTag.id, confidence: 0.85, source: 'ai' },
              { onConflict: 'article_id,tag_id' }
            );
          }
        }
        log(`    ${DIM}Law enforcement: ${analysis.law_enforcement.join(', ')}${RESET}`);
      }

      // Tag with police station if mentioned
      if (analysis.police_station) {
        const stationSlug = slugify(analysis.police_station);
        if (stationSlug) {
          const { data: stationTag } = await supabase
            .from('tags')
            .upsert(
              { name: analysis.police_station, slug: stationSlug, type: 'organization', is_active: true, created_by: 'ai' },
              { onConflict: 'slug' }
            )
            .select('id')
            .single();

          if (stationTag) {
            await supabase.from('article_tags').upsert(
              { article_id: article.id, tag_id: stationTag.id, confidence: 0.9, source: 'ai' },
              { onConflict: 'article_id,tag_id' }
            );
          }
          log(`    ${DIM}Police station: ${analysis.police_station}${RESET}`);
        }
      }

      // Tag with political party if mentioned
      if (analysis.political_party) {
        const partySlug = slugify(analysis.political_party);
        if (partySlug) {
          const { data: partyTag } = await supabase
            .from('tags')
            .upsert(
              { name: analysis.political_party, slug: partySlug, type: 'organization', is_active: true, created_by: 'ai' },
              { onConflict: 'slug' }
            )
            .select('id')
            .single();

          if (partyTag) {
            await supabase.from('article_tags').upsert(
              { article_id: article.id, tag_id: partyTag.id, confidence: 0.85, source: 'ai' },
              { onConflict: 'article_id,tag_id' }
            );
          }
          log(`    ${DIM}Party: ${analysis.political_party}${RESET}`);
        }
      }

      // Store election info in article metadata if present
      if (analysis.election_info) {
        await supabase
          .from('articles')
          .update({
            // Store election data in the existing metadata-capable topics array + a custom approach:
            // We append election context to topics for searchability
            topics: [...new Set([...(analysis.topics || []), 'election'])],
          })
          .eq('id', article.id);
        log(`    ${DIM}Election: ${analysis.election_info.type} in ${analysis.election_info.constituency || 'N/A'}${analysis.election_info.result ? ' (' + analysis.election_info.result + ')' : ''}${RESET}`);
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

async function extractEntitiesFromContent(
  articleId: string,
  title: string,
  content: string,
): Promise<void> {
  try {
    // Use article content directly — no dependency on Graphiti search
    const textForExtraction = `Title: ${title}\n\n${content}`.slice(0, 4000);

    const entityPrompt = `/no_think\nExtract named entities from this news article. Return a JSON array.

Article:
${textForExtraction}

Example output:
[{"name": "Colombo", "type": "location"}, {"name": "Ranil Wickremesinghe", "type": "person"}, {"name": "Central Bank of Sri Lanka", "type": "organization"}, {"name": "inflation", "type": "topic"}]

Rules:
- "name" is the actual proper noun from the article (e.g. "Colombo", NOT "location")
- "type" is one of: person, organization, location, topic
- Maximum 10 entities
- Respond with ONLY a JSON array, no other text`;

    const llmController = new AbortController();
    const llmTimeout = setTimeout(() => llmController.abort(), 120000);

    const llmRes = await fetch(`${ollamaUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaLlmModel,
        messages: [{ role: 'user', content: entityPrompt }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: llmController.signal,
    });
    clearTimeout(llmTimeout);

    if (!llmRes.ok) return;

    const llmData = await llmRes.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    let responseText = llmData.choices?.[0]?.message?.content?.trim() || '';
    responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    responseText = responseText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();

    let entities: Array<{ name: string; type: string }>;
    try {
      const parsed = JSON.parse(responseText);
      entities = Array.isArray(parsed) ? parsed : (parsed.entities || []);
    } catch {
      return;
    }

    const validTypes = new Set(['person', 'organization', 'location', 'topic']);
    let saved = 0;

    for (const entity of entities) {
      if (!entity.name || !validTypes.has(entity.type)) continue;
      // Skip if the LLM output a type name as the entity name (hallucination guard)
      if (validTypes.has(entity.name.toLowerCase())) continue;

      const slug = slugify(entity.name);
      if (!slug) continue;

      // Upsert tag
      const { data: tag, error: tagErr } = await supabase
        .from('tags')
        .upsert(
          { name: entity.name, slug, type: entity.type, is_active: true },
          { onConflict: 'slug' }
        )
        .select('id')
        .single();

      if (tagErr || !tag) continue;

      // Link to article
      await supabase
        .from('article_tags')
        .upsert(
          { article_id: articleId, tag_id: tag.id, confidence: 0.8, source: 'ai' },
          { onConflict: 'article_id,tag_id' }
        );
      saved++;
    }

    if (saved > 0) {
      log(`    ${GREEN}✓${RESET} Extracted ${saved} entities`);
    }
  } catch {
    // Entity extraction is best-effort — don't fail the sync
  }
}

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

      // Extract entities from article content via LLM and create local tags
      await extractEntitiesFromContent(article.id, article.title, article.content || '');

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
