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

async function run() {
  // Check if already exists
  const { data: existing } = await sb.from('sources').select('id').eq('slug', 'news19').single();
  if (existing) {
    console.log('News19 already exists:', existing.id);
    return;
  }

  const { data, error } = await sb.from('sources').insert({
    name: 'News 19',
    slug: 'news19',
    url: 'https://www.news19.lk',
    bias_score: 0,
    factuality_score: 55,
    rss_url: 'https://www.news19.lk/feed',
    scrape_config: {},
    is_active: true,
    article_count: 0,
    description: 'News 19 - Sri Lankan news website covering politics, business, sports, and entertainment.',
    country: 'LK',
    language: 'en',
    languages: ['en'],
    is_original_reporter: true,
  }).select().single();

  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('News19 added:', data.id);
  }
}

run();
