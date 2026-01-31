/**
 * Playwright-based article scraper for Cloudflare-protected sites.
 * Connects to the Playwright Docker service (firecrawl-playwright on port 3100).
 *
 * Usage:
 *   npx tsx scripts/scrape-playwright.ts --url "https://www.dailymirror.lk/..."
 *   npx tsx scripts/scrape-playwright.ts --source daily-mirror --limit 5
 *   npx tsx scripts/scrape-playwright.ts --source dinamina --limit 5
 *
 * Requires: Playwright Docker service running (docker compose up firecrawl-playwright)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { chromium } from 'playwright';

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const PLAYWRIGHT_WS = process.env.PLAYWRIGHT_WS_URL || 'ws://localhost:3100';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Scrape a single URL using Playwright
// ---------------------------------------------------------------------------
async function scrapeWithPlaywright(
  url: string
): Promise<{ title: string; content: string; imageUrl: string | null } | null> {
  let browser;
  try {
    // Connect to the Docker Playwright service
    browser = await chromium.connect(PLAYWRIGHT_WS, { timeout: 15000 });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Navigate and wait for content to load
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait a bit for Cloudflare challenge to resolve
    await page.waitForTimeout(3000);

    // Extract content
    const result = await page.evaluate(() => {
      // Try common article selectors
      const selectors = [
        'article',
        '.article-content',
        '.story-text',
        '.inner-content',
        '.entry-content',
        '.post-content',
        '.content-area',
        '#article-body',
        'main',
      ];

      let content = '';
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 200) {
          content = el.textContent.trim();
          break;
        }
      }

      // Fallback: get body text
      if (!content) {
        content = document.body?.textContent?.trim() || '';
      }

      // Get title
      const title =
        document.querySelector('h1')?.textContent?.trim() ||
        document.querySelector('title')?.textContent?.trim() ||
        '';

      // Get OG image
      const imageUrl =
        (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content ||
        (document.querySelector('article img') as HTMLImageElement)?.src ||
        null;

      return { title, content, imageUrl };
    });

    await browser.close();

    if (!result.content || result.content.length < 100) {
      return null;
    }

    return result;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(`  ${RED}Playwright error: ${err instanceof Error ? err.message : err}${RESET}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scrape articles from a source's homepage/sitemap
// ---------------------------------------------------------------------------
async function scrapeSourceArticles(
  sourceSlug: string,
  limit: number
): Promise<void> {
  // Get source from DB
  const { data: source, error: srcErr } = await supabase
    .from('sources')
    .select('*')
    .eq('slug', sourceSlug)
    .single();

  if (srcErr || !source) {
    console.error(`${RED}✗${RESET} Source "${sourceSlug}" not found`);
    return;
  }

  console.log(`${GREEN}✓${RESET} Source: ${source.name} (${source.language})`);
  console.log(`  URL: ${source.url}\n`);

  // If source has RSS, try it first
  if (source.rss_url) {
    console.log(`${DIM}Trying RSS first: ${source.rss_url}${RESET}`);
    const rssRes = await fetch(source.rss_url).catch(() => null);
    if (rssRes && rssRes.ok) {
      const text = await rssRes.text();
      if (text.includes('<item>') || text.includes('<entry>')) {
        console.log(`${GREEN}✓${RESET} RSS feed works — use test-ingest.ts instead\n`);
        return;
      }
    }
    console.log(`${YELLOW}–${RESET} RSS unavailable, falling back to Playwright\n`);
  }

  // Scrape the homepage to find article links
  let browser;
  try {
    browser = await chromium.connect(PLAYWRIGHT_WS, { timeout: 15000 });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    console.log(`${DIM}Loading homepage...${RESET}`);
    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Extract article links
    const links = await page.evaluate((baseUrl: string) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const articleLinks: Array<{ url: string; title: string }> = [];
      const seen = new Set<string>();

      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href;
        const text = a.textContent?.trim() || '';

        // Filter: must be same domain, have reasonable title length, look like an article
        if (
          !href.startsWith(baseUrl) &&
          !href.startsWith('/')
        ) continue;
        if (text.length < 10 || text.length > 200) continue;
        if (seen.has(href)) continue;

        // Skip navigation/category links
        if (href.split('/').length < 4) continue;

        seen.add(href);
        articleLinks.push({ url: href, title: text });
      }

      return articleLinks;
    }, source.url);

    await browser.close();

    console.log(`Found ${links.length} article links\n`);

    // Deduplicate against existing URLs
    const urls = links.slice(0, limit * 2).map(l => l.url);
    const { data: existing } = await supabase
      .from('articles')
      .select('url')
      .in('url', urls);
    const existingUrls = new Set((existing || []).map(a => a.url));

    let inserted = 0;
    for (const link of links) {
      if (inserted >= limit) break;
      if (existingUrls.has(link.url)) {
        console.log(`${YELLOW}–${RESET} ${link.title.slice(0, 60)}... ${DIM}(exists)${RESET}`);
        continue;
      }

      console.log(`${DIM}Scraping: ${link.title.slice(0, 60)}...${RESET}`);
      const scraped = await scrapeWithPlaywright(link.url);

      if (!scraped) {
        console.log(`  ${RED}✗${RESET} Scrape failed`);
        continue;
      }

      const { error: insertErr } = await supabase.from('articles').insert({
        source_id: source.id,
        url: link.url,
        title: scraped.title || link.title,
        content: scraped.content,
        excerpt: scraped.content.slice(0, 300),
        image_url: scraped.imageUrl,
        language: source.language,
        original_language: source.language,
        is_processed: false,
      });

      if (insertErr) {
        console.log(`  ${RED}✗${RESET} Insert error: ${insertErr.message}`);
      } else {
        console.log(`  ${GREEN}✓${RESET} ${(scraped.title || link.title).slice(0, 60)}... (${scraped.content.length} chars)`);
        inserted++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`\n${GREEN}▸${RESET} Results: ${inserted} articles inserted\n`);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(`${RED}✗${RESET} Error: ${err instanceof Error ? err.message : err}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let url: string | null = null;
  let sourceSlug: string | null = null;
  let limit = 5;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) url = args[++i];
    if (args[i] === '--source' && args[i + 1]) sourceSlug = args[++i];
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
  }

  console.log(`\n${GREEN}▸${RESET} Playwright Scraper`);
  console.log(`  Browser: ${PLAYWRIGHT_WS}\n`);

  if (url) {
    // Single URL mode
    console.log(`${DIM}Scraping: ${url}${RESET}`);
    const result = await scrapeWithPlaywright(url);
    if (result) {
      console.log(`${GREEN}✓${RESET} Title: ${result.title}`);
      console.log(`  Content: ${result.content.length} chars`);
      console.log(`  Image: ${result.imageUrl || 'none'}`);
      console.log(`\n${DIM}First 500 chars:${RESET}`);
      console.log(result.content.slice(0, 500));
    } else {
      console.log(`${RED}✗${RESET} Scrape failed`);
    }
  } else if (sourceSlug) {
    await scrapeSourceArticles(sourceSlug, limit);
  } else {
    console.log(`Usage:`);
    console.log(`  npx tsx scripts/scrape-playwright.ts --url "https://example.com/article"`);
    console.log(`  npx tsx scripts/scrape-playwright.ts --source daily-mirror --limit 5`);
    console.log(`  npx tsx scripts/scrape-playwright.ts --source dinamina --limit 5`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
