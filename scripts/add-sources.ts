/**
 * Add new sources to the database
 * Usage: npx tsx scripts/add-sources.ts
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
  process.env.SUPABASE_SERVICE_KEY!
);

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const sources = [
  // Sinhala sources with working RSS
  {
    name: 'දිවයින',
    slug: 'divaina',
    url: 'https://www.divaina.lk',
    rss_url: 'https://www.divaina.lk/feed',
    bias_score: 0.1,
    factuality_score: 60,
    language: 'si',
    description: 'Sinhala daily newspaper with wide readership, covers politics, society, and local news.',
  },
  {
    name: 'මව්බිම',
    slug: 'mawbima',
    url: 'https://mawbima.lk',
    rss_url: 'https://mawbima.lk/feed/',
    bias_score: 0.2,
    factuality_score: 55,
    language: 'si',
    description: 'Popular Sinhala news website covering breaking news, politics, sports, and entertainment.',
  },
  {
    name: 'සිළුමිණ',
    slug: 'silumina',
    url: 'https://www.silumina.lk',
    rss_url: 'https://silumina.lk/feed/',
    bias_score: 0.3,
    factuality_score: 55,
    language: 'si',
    description: 'Sinhala Sunday newspaper by Lake House (state-owned). Covers news, culture, and features.',
  },
  // Sinhala sources needing Playwright (no RSS)
  {
    name: 'දිනමිණ',
    slug: 'dinamina',
    url: 'https://www.dinamina.lk',
    rss_url: null,
    bias_score: 0.3,
    factuality_score: 55,
    language: 'si',
    description: 'State-owned Sinhala daily newspaper. Cloudflare-protected, requires Playwright scraping.',
  },
  // English sources with working RSS
  {
    name: 'Daily FT',
    slug: 'daily-ft',
    url: 'https://www.ft.lk',
    rss_url: 'https://www.ft.lk/rss/top-story/26',
    bias_score: 0.15,
    factuality_score: 75,
    language: 'en',
    description: "Sri Lanka's leading business newspaper. Strong coverage of economics, policy, and corporate news.",
  },
  {
    name: 'Lanka Business Online',
    slug: 'lanka-business-online',
    url: 'https://lankabusinessonline.com',
    rss_url: 'https://lankabusinessonline.com/feed/',
    bias_score: 0.2,
    factuality_score: 75,
    language: 'en',
    description: 'Pioneer in online business journalism in Sri Lanka. Markets, corporate, and economic policy.',
  },
  {
    name: 'News.lk',
    slug: 'news-lk',
    url: 'https://www.news.lk',
    rss_url: 'https://www.news.lk/news?format=feed&type=rss',
    bias_score: 0.8,
    factuality_score: 60,
    language: 'en',
    description: 'Official Government News Portal of Sri Lanka. Government press releases and statements.',
  },
  {
    name: 'Sri Lanka Mirror',
    slug: 'sri-lanka-mirror',
    url: 'https://srilankamirror.com',
    rss_url: 'https://srilankamirror.com/feed/',
    bias_score: -0.3,
    factuality_score: 50,
    language: 'en',
    description: 'Independent news website known for political scoops and critical reporting.',
  },
  {
    name: 'Onlanka',
    slug: 'onlanka',
    url: 'https://onlanka.com',
    rss_url: 'https://onlanka.com/feed/',
    bias_score: 0.0,
    factuality_score: 55,
    language: 'en',
    description: 'Sri Lankan diaspora-focused news portal with broad coverage of politics and community events.',
  },
  {
    name: 'Lanka News Web',
    slug: 'lanka-news-web',
    url: 'https://lankanewsweb.net',
    rss_url: 'https://lankanewsweb.net/feed/',
    bias_score: -0.1,
    factuality_score: 55,
    language: 'en',
    description: 'General Sri Lankan news covering politics, entertainment, sports, and world news.',
  },
];

async function main() {
  console.log(`\n${GREEN}▸${RESET} Adding ${sources.length} new sources\n`);

  for (const s of sources) {
    const { error } = await supabase.from('sources').insert({
      ...s,
      is_active: true,
      country: 'LK',
      scrape_config: '{}',
    });

    if (error) {
      if (error.code === '23505') {
        console.log(`  ${YELLOW}–${RESET} ${s.name} (already exists)`);
      } else {
        console.log(`  ${RED}✗${RESET} ${s.name}: ${error.message}`);
      }
    } else {
      console.log(`  ${GREEN}✓${RESET} ${s.name} (${s.language}, bias: ${s.bias_score})`);
    }
  }

  const { count } = await supabase
    .from('sources')
    .select('*', { count: 'exact', head: true });

  console.log(`\nTotal sources: ${count}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
