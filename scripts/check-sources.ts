import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = '/Users/chaturaattidiya/Documents/Github/project-ref/ground-news/env.local';
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
  // Get all active sources with article counts
  const { data: sources } = await supabase
    .from('sources')
    .select('id, name, slug, rss_url, language')
    .eq('is_active', true)
    .order('name');

  console.log('=== All Active Sources - Current Data Status ===\n');
  console.log('Source'.padEnd(30), 'Total'.padStart(6), 'Date'.padStart(6), 'Content'.padStart(8), 'Author'.padStart(8), 'Enriched'.padStart(9), 'Lang', 'RSS');

  for (const s of sources || []) {
    const { count: total } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', s.id);
    const { count: withDate } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', s.id).not('published_at', 'is', null);
    const { count: withContent } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', s.id).not('content', 'is', null);
    const { count: withAuthor } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', s.id).not('author', 'is', null);
    const { count: enriched } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', s.id).not('ai_enriched_at', 'is', null);

    const name = s.name.slice(0, 28).padEnd(30);
    const rssStatus = s.rss_url ? 'Yes' : 'No';
    console.log(`${name} ${String(total).padStart(6)} ${String(withDate).padStart(6)} ${String(withContent).padStart(8)} ${String(withAuthor).padStart(8)} ${String(enriched).padStart(9)}  ${s.language}   ${rssStatus}`);
  }

  // Show sources that need attention (low article count or missing data)
  console.log('\n=== Sources Needing Attention ===\n');
  for (const s of sources || []) {
    const { count: total } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', s.id);
    const { count: withDate } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', s.id).not('published_at', 'is', null);

    if ((total || 0) < 10) {
      console.log(`  LOW DATA: ${s.name} (${s.slug}) — ${total} articles`);
    } else if (withDate !== total) {
      const missing = (total || 0) - (withDate || 0);
      console.log(`  MISSING DATES: ${s.name} (${s.slug}) — ${missing}/${total} without dates`);
    }
  }
}

main().catch(console.error);
