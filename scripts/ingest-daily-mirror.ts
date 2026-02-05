/**
 * Ingest Daily Mirror articles using Playwright (Cloudflare-protected).
 * Daily Mirror URL format: /category/Article-Title/CATID-ARTICLEID
 *
 * Usage:
 *   npx tsx scripts/ingest-daily-mirror.ts                  # ingest up to 30 articles
 *   npx tsx scripts/ingest-daily-mirror.ts --limit 50       # ingest up to 50
 *   npx tsx scripts/ingest-daily-mirror.ts --dry-run        # just list articles, don't insert
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { chromium, Page, Browser } from 'playwright-core';

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
const DAILY_MIRROR_SOURCE_ID = ''; // Will be fetched from DB

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Daily Mirror article URL pattern: /category/title/CATID-ARTICLEID
const ARTICLE_URL_RE = /\/[-\w]+\/[-\w]+\/\d+-(\d{5,})\b/;

function isArticleUrl(url: string): boolean {
  return ARTICLE_URL_RE.test(url) && url.includes('dailymirror.lk');
}

function extractArticleId(url: string): string | null {
  const m = url.match(ARTICLE_URL_RE);
  return m ? m[1] : null;
}

async function waitForCloudflare(page: Page, maxWait = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const title = await page.title();
    if (!title.includes('Just a moment') && !title.includes('Checking')) return true;
    await page.waitForTimeout(2000);
  }
  return false;
}

function extractDateFromText(text: string): string | null {
  // Pattern 1: "Month DD, YYYY HH:MM am/pm"
  const longDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
  const m1 = text.match(longDateRe);
  if (m1) {
    try {
      const d = new Date(`${m1[1]} ${m1[2]}, ${m1[3]} ${m1[4]}`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }
  // Pattern 2: "Month DD, YYYY"
  const dateOnlyRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i;
  const m2 = text.match(dateOnlyRe);
  if (m2) {
    try {
      const d = new Date(`${m2[1]} ${m2[2]}, ${m2[3]}`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }
  // Pattern 3: DD-MM-YYYY or DD/MM/YYYY
  const dmyRe = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/;
  const m3 = text.match(dmyRe);
  if (m3) {
    try {
      const d = new Date(`${m3[3]}-${m3[2].padStart(2, '0')}-${m3[1].padStart(2, '0')}T00:00:00+05:30`);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString();
    } catch {}
  }
  return null;
}

interface ArticleData {
  url: string;
  title: string;
  content: string;
  author: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  excerpt: string | null;
}

async function scrapeArticle(page: Page, url: string): Promise<ArticleData | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const resolved = await waitForCloudflare(page, 15000);
    if (!resolved) return null;

    const data = await page.evaluate(() => {
      // Meta tags
      const metas: Record<string, string> = {};
      document.querySelectorAll('meta').forEach((m) => {
        const name = m.getAttribute('name') || m.getAttribute('property') || '';
        const content = m.getAttribute('content') || '';
        if (name && content) metas[name] = content;
      });

      // Title
      const h1 = document.querySelector('h1')?.textContent?.trim() || '';
      const ogTitle = metas['og:title'] || '';

      // Author — Daily Mirror puts author in various places
      const authorSelectors = [
        '.author-name', '.article-author', '.writer-name', '.writer',
        '.byline', '.story-author', '.news-datestamp a',
        '.inner-fontstyle a[href*="searchstory"]',
      ];
      let author = '';
      for (const sel of authorSelectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          author = el.textContent.trim();
          break;
        }
      }
      if (!author) author = metas['author'] || '';

      // Date — check meta tags first, then page elements
      const ogDate = metas['article:published_time'] || metas['og:article:published_time'] || '';
      let dateText = '';
      let dateAttr = '';
      const dateSelectors = ['time', '.date', '.article-date', '.publish-date', '.news-datestamp'];
      for (const sel of dateSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          dateText = el.textContent?.trim() || '';
          dateAttr = el.getAttribute('datetime') || '';
          if (dateText || dateAttr) break;
        }
      }

      // Content — try article-specific selectors
      const contentSelectors = [
        '.article-body', '.story-text', '.inner-content',
        '.article-content', '.news-content', '#article-body',
        '.inner-fontstyle', 'article', 'main'
      ];
      let content = '';
      for (const sel of contentSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 200) {
          content = el.textContent.trim();
          break;
        }
      }

      // Image
      const imageUrl = metas['og:image'] || '';

      return {
        title: h1 || ogTitle,
        author,
        ogDate,
        dateText,
        dateAttr,
        content,
        imageUrl,
        bodyText: document.body?.textContent?.trim().slice(0, 2000) || '',
      };
    });

    if (!data.content || data.content.length < 100) return null;

    // Resolve date
    let publishedAt: string | null = null;
    if (data.ogDate) {
      try { const d = new Date(data.ogDate); if (!isNaN(d.getTime())) publishedAt = d.toISOString(); } catch {}
    }
    if (!publishedAt && data.dateAttr) {
      try { const d = new Date(data.dateAttr); if (!isNaN(d.getTime())) publishedAt = d.toISOString(); } catch {}
    }
    if (!publishedAt) publishedAt = extractDateFromText(data.dateText);
    if (!publishedAt) publishedAt = extractDateFromText(data.bodyText.slice(0, 2000));

    // Clean excerpt
    const excerpt = data.content.replace(/\s+/g, ' ').slice(0, 300);

    return {
      url,
      title: data.title,
      content: data.content,
      author: data.author || null,
      publishedAt,
      imageUrl: data.imageUrl || null,
      excerpt,
    };
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] || '30', 10) : 30;
  const dryRun = args.includes('--dry-run');

  console.log(`${BOLD}Daily Mirror Ingestion${RESET}${dryRun ? ' (DRY RUN)' : ''} — limit: ${limit}\n`);

  // Get source from DB
  const { data: source } = await supabase
    .from('sources')
    .select('id, name, slug')
    .eq('slug', 'daily-mirror')
    .single();

  if (!source) {
    console.log(`${RED}✗${RESET} Source 'daily-mirror' not found`);
    return;
  }

  console.log(`${GREEN}✓${RESET} Source: ${source.name} (${source.id})\n`);

  // Connect to Playwright
  console.log(`${DIM}Connecting to Playwright...${RESET}`);
  const browser = await chromium.connect(PLAYWRIGHT_WS, { timeout: 10000 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Step 1: Load homepage and extract article links
  console.log(`${DIM}Loading Daily Mirror homepage...${RESET}`);
  await page.goto('https://www.dailymirror.lk/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const cfOk = await waitForCloudflare(page);
  if (!cfOk) {
    console.log(`${RED}✗${RESET} Cloudflare challenge not resolved`);
    await browser.close();
    return;
  }

  // Extract article links from homepage
  const homeLinks = await page.evaluate(() => {
    const re = /\/[-\w]+\/[-\w]+\/\d+-(\d{5,})/;
    return Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ url: (a as HTMLAnchorElement).href, text: a.textContent?.trim()?.slice(0, 150) || '' }))
      .filter(l => l.url.includes('dailymirror.lk') && re.test(l.url) && l.text.length > 10);
  });

  // Deduplicate by article ID
  const seen = new Set<string>();
  const articleLinks: Array<{ url: string; title: string }> = [];
  for (const l of homeLinks) {
    const id = extractArticleId(l.url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    articleLinks.push({ url: l.url, title: l.text });
  }

  console.log(`Found ${articleLinks.length} unique article links on homepage\n`);

  // Deduplicate against existing DB
  const urls = articleLinks.map(l => l.url);
  const { data: existing } = await supabase
    .from('articles')
    .select('url')
    .eq('source_id', source.id);
  const existingUrls = new Set((existing || []).map(a => a.url));
  const existingIds = new Set(
    (existing || []).map(a => extractArticleId(a.url)).filter(Boolean)
  );

  const newLinks = articleLinks.filter(l => {
    if (existingUrls.has(l.url)) return false;
    const id = extractArticleId(l.url);
    return id ? !existingIds.has(id) : true;
  });

  console.log(`${newLinks.length} new articles (${articleLinks.length - newLinks.length} already exist)\n`);

  if (dryRun) {
    for (const l of newLinks.slice(0, limit)) {
      console.log(`  ${l.title.slice(0, 70)}`);
      console.log(`    ${l.url}`);
    }
    await browser.close();
    return;
  }

  // Step 2: Scrape each new article
  let inserted = 0;
  let failed = 0;

  for (const link of newLinks.slice(0, limit)) {
    console.log(`  ${DIM}[${inserted + failed + 1}/${Math.min(newLinks.length, limit)}]${RESET} ${link.title.slice(0, 50)}...`);

    const article = await scrapeArticle(page, link.url);
    if (!article) {
      console.log(`    ${RED}✗${RESET} Scrape failed or content too short`);
      failed++;
      await page.waitForTimeout(2000);
      continue;
    }

    const { error } = await supabase.from('articles').insert({
      source_id: source.id,
      url: article.url,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      published_at: article.publishedAt,
      author: article.author,
      image_url: article.imageUrl,
      language: 'en',
      original_language: 'en',
      is_processed: false,
    });

    if (error) {
      if (error.message?.includes('duplicate')) {
        console.log(`    ${YELLOW}–${RESET} Duplicate`);
      } else {
        console.log(`    ${RED}✗${RESET} DB error: ${error.message}`);
        failed++;
      }
    } else {
      const dateStr = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'no date';
      const authorStr = article.author ? `by ${article.author}` : '';
      console.log(`    ${GREEN}✓${RESET} ${article.title.slice(0, 50)}... (${dateStr}) ${authorStr}`);
      inserted++;
    }

    await page.waitForTimeout(2000);
  }

  await browser.close();

  console.log(`\n${GREEN}▸${RESET} Done: ${inserted} inserted, ${failed} failed`);

  // Final stats
  const { count: total } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', source.id);
  const { count: withDate } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', source.id).not('published_at', 'is', null);
  const { count: withAuthor } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', source.id).not('author', 'is', null);
  console.log(`  Total: ${total} | With date: ${withDate} | With author: ${withAuthor}`);
}

main().catch(err => {
  console.error(`${RED}✗${RESET} Fatal error:`, err);
  process.exit(1);
});
