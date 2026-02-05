/**
 * Quick check of Ada Derana article data in the database.
 * Usage: npx tsx scripts/check-ada-derana.ts
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

async function main() {
  const { data: sources } = await supabase
    .from('sources')
    .select('id, name, slug, rss_url, is_active')
    .like('slug', 'ada-derana-%');

  console.log('=== Ada Derana Sources ===');
  for (const s of sources || []) {
    const { count } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', s.id);

    const { count: withDate } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', s.id)
      .not('published_at', 'is', null);

    const { count: withContent } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', s.id)
      .not('content', 'is', null);

    const { count: enriched } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', s.id)
      .not('ai_enriched_at', 'is', null);

    const { count: withAuthor } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', s.id)
      .not('author', 'is', null);

    console.log(`\n${s.name} (${s.slug})`);
    console.log(`  Active: ${s.is_active}, RSS: ${s.rss_url}`);
    console.log(`  Total articles: ${count}`);
    console.log(`  With published_at: ${withDate}`);
    console.log(`  With content: ${withContent}`);
    console.log(`  With author: ${withAuthor}`);
    console.log(`  Enriched: ${enriched}`);
  }

  // Show recent articles
  const adaEnId = sources?.find(s => s.slug === 'ada-derana-en')?.id;
  const adaSiId = sources?.find(s => s.slug === 'ada-derana-si')?.id;

  if (adaEnId) {
    const { data: recent } = await supabase
      .from('articles')
      .select('title, url, published_at, author, excerpt')
      .eq('source_id', adaEnId)
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\n=== Recent Ada Derana EN Articles ===');
    for (const a of recent || []) {
      console.log(`\n  Title: ${a.title?.slice(0, 70)}`);
      console.log(`  URL: ${a.url?.slice(0, 70)}`);
      console.log(`  Date: ${a.published_at || 'NULL'}`);
      console.log(`  Author: ${a.author || 'NULL'}`);
      console.log(`  Excerpt: ${(a.excerpt || 'NULL').slice(0, 100)}`);
    }
  }

  if (adaSiId) {
    const { data: recent } = await supabase
      .from('articles')
      .select('title, url, published_at, author, excerpt')
      .eq('source_id', adaSiId)
      .order('created_at', { ascending: false })
      .limit(5);

    console.log('\n=== Recent Ada Derana SI Articles ===');
    for (const a of recent || []) {
      console.log(`\n  Title: ${a.title?.slice(0, 70)}`);
      console.log(`  URL: ${a.url?.slice(0, 70)}`);
      console.log(`  Date: ${a.published_at || 'NULL'}`);
      console.log(`  Author: ${a.author || 'NULL'}`);
      console.log(`  Excerpt: ${(a.excerpt || 'NULL').slice(0, 100)}`);
    }
  }
}

main().catch(console.error);
