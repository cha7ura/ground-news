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

const newSources = [
  {
    name: 'News First English',
    slug: 'newsfirst-en',
    url: 'https://english.newsfirst.lk',
    bias_score: 0,
    factuality_score: 55,
    language: 'en',
    languages: ['en'],
    description: 'News First English - Sri Lanka\'s leading trilingual news network, English edition.',
  },
  {
    name: 'News First Sinhala',
    slug: 'newsfirst-si',
    url: 'https://sinhala.newsfirst.lk',
    bias_score: 0,
    factuality_score: 55,
    language: 'si',
    languages: ['si'],
    description: 'News First Sinhala - Sri Lanka\'s leading trilingual news network, Sinhala edition.',
  },
  {
    name: 'News First Tamil',
    slug: 'newsfirst-ta',
    url: 'https://tamil.newsfirst.lk',
    bias_score: 0,
    factuality_score: 55,
    language: 'ta',
    languages: ['ta'],
    description: 'News First Tamil - Sri Lanka\'s leading trilingual news network, Tamil edition.',
  },
];

async function run() {
  for (const src of newSources) {
    const { data: existing } = await sb.from('sources').select('id').eq('slug', src.slug).single();
    if (existing) {
      console.log(`${src.slug} already exists: ${existing.id}`);
      continue;
    }

    const { data, error } = await sb.from('sources').insert({
      ...src,
      rss_url: null,
      scrape_config: {},
      is_active: true,
      article_count: 0,
      country: 'LK',
      is_original_reporter: true,
    }).select().single();

    if (error) {
      console.error(`Error adding ${src.slug}:`, error.message);
    } else {
      console.log(`Added ${src.slug}: ${data.id}`);
    }
  }
}

run();
