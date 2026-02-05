/**
 * Update source scrape_config with per-source CSS selectors for Playwright scraping.
 * Sets custom selectors for sources where defaults don't work well.
 *
 * Usage:
 *   npx tsx scripts/update-source-configs.ts          # Apply updates
 *   npx tsx scripts/update-source-configs.ts --dry     # Preview only
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
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Per-source selector configurations
// Only define overrides — sources not listed here use defaults
// ---------------------------------------------------------------------------

interface SourceSelectors {
  selectors?: {
    title?: string[];
    author?: string[];
    date?: string[];
    content?: string[];
    image?: string[];
  };
  rateLimitMs?: number;
}

const SOURCE_CONFIGS: Record<string, SourceSelectors> = {
  // --- English sources ---
  'ada-derana-en': {
    selectors: {
      content: ['.news-content', '#news_body', 'article', 'main'],
      date: ['.news-datestamp', 'time[datetime]'],
      author: ['.author-name'],
    },
  },
  'the-island': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date', '.post-date'],
      author: ['.author-name', '.byline', '[rel="author"]'],
    },
  },
  'daily-mirror': {
    selectors: {
      content: ['.inner-fontstyle', '.article-body', '.story-text', 'article'],
      date: ['time', '.news-datestamp', '.date'],
      author: ['.inner-fontstyle a[href*="searchstory"]', '.author-name', '.byline'],
    },
    rateLimitMs: 3000,
  },
  'daily-news': {
    selectors: {
      content: ['.entry-content', '.article-body', 'article', 'main'],
      date: ['time[datetime]', '.entry-date', '.post-date', '.date'],
      author: ['.author-name', '.byline', '[rel="author"]'],
    },
  },
  'sunday-observer': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'onlanka': {
    selectors: {
      content: ['.td-post-content', '.entry-content', 'article'],
      date: ['time[datetime]', '.entry-date', '.td-post-date'],
      author: ['.td-post-author-name', '.author-name'],
    },
  },
  'daily-ft': {
    selectors: {
      content: ['.field-name-body', '.article-content', 'article'],
      date: ['.date-display-single', 'time[datetime]', '.date'],
      author: ['.field-name-field-author', '.author-name'],
    },
  },
  'ceylon-today': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'colombo-telegraph': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline', '[rel="author"]'],
    },
  },
  'asian-mirror': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'newswire': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'economynext': {
    selectors: {
      content: ['.article-body', '.entry-content', 'article'],
      date: ['time[datetime]', '.article-date', '.date'],
      author: ['.article-author', '.author-name'],
    },
  },
  'sri-lanka-mirror': {
    selectors: {
      content: ['.entry-content', '.post-content', 'article'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'lanka-news-web': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },

  // --- Sinhala sources ---
  'ada-derana-si': {
    selectors: {
      content: ['.news-content', '#news_body', 'article', 'main'],
      date: ['.news-datestamp', 'time[datetime]'],
      author: ['.author-name'],
    },
  },
  'dinamina': {
    selectors: {
      content: ['.field-name-body', '.article-content', 'article', 'main'],
      date: ['.field-name-field-post-date time', 'time[datetime]', '.date'],
      author: ['.field-name-field-author', '.author-name'],
    },
  },
  'divaina': {
    selectors: {
      content: ['.entry-content', '.post-content', 'article'],
      date: ['time[datetime]', '.entry-date', '.post-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'mawbima': {
    selectors: {
      content: ['.entry-content', '.post-content', 'article'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'lankadeepa': {
    selectors: {
      content: ['.article-content', '.entry-content', 'article'],
      date: ['time[datetime]', '.article-date', '.date'],
      author: ['.author-name'],
    },
  },
  'news-lk-si': {
    selectors: {
      content: ['.item-page', '.article-content', 'article', 'main'],
      date: ['.article-info time', 'time[datetime]', '.create', '.date'],
      author: ['.createdby', '.author-name'],
    },
  },
  'ada-lk': {
    selectors: {
      content: ['.news_body', '.article-content', 'article'],
      date: ['.news_date', '.date', 'time[datetime]'],
      author: ['.author-name'],
    },
  },
  'lanka-truth-si': {
    selectors: {
      content: ['.entry-content', 'article', '.post-content'],
      date: ['time[datetime]', '.entry-date'],
      author: ['.author-name', '.byline'],
    },
  },
  'news19': {
    selectors: {
      content: ['.entry-content', '.post-content', 'article'],
      date: ['time[datetime]', '.entry-date', '.post-date'],
      author: ['.author-name', '.byline', '[rel="author"]'],
    },
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${BOLD}Update Source Scrape Configs${RESET}${isDry ? ` ${YELLOW}(DRY RUN)${RESET}` : ''}\n`);

  const { data: sources } = await supabase
    .from('sources')
    .select('id, slug, name, scrape_config, is_active')
    .eq('is_active', true)
    .order('name');

  if (!sources || sources.length === 0) {
    console.log('No active sources found');
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const source of sources) {
    const customConfig = SOURCE_CONFIGS[source.slug];
    if (!customConfig) {
      console.log(`  ${DIM}– ${source.name} (${source.slug}): using defaults${RESET}`);
      skipped++;
      continue;
    }

    const existing = (source.scrape_config || {}) as Record<string, unknown>;
    const merged = {
      ...existing,
      selectors: customConfig.selectors,
      ...(customConfig.rateLimitMs ? { rateLimitMs: customConfig.rateLimitMs } : {}),
    };

    console.log(`  ${GREEN}✓${RESET} ${source.name} (${source.slug}): ${JSON.stringify(customConfig.selectors?.content?.[0] || 'defaults')}`);

    if (!isDry) {
      await supabase
        .from('sources')
        .update({ scrape_config: merged })
        .eq('id', source.id);
    }
    updated++;
  }

  console.log(`\n${BOLD}Summary:${RESET}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Using defaults: ${skipped}`);
  console.log(`  Total active: ${sources.length}\n`);
}

main().catch(console.error);
