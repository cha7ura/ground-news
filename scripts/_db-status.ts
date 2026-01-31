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
  // Overall counts
  const { count: total } = await sb.from('articles').select('*', { count: 'exact', head: true });
  const { count: backfill } = await sb.from('articles').select('*', { count: 'exact', head: true }).eq('is_backfill', true);
  const { count: withAuthor } = await sb.from('articles').select('*', { count: 'exact', head: true }).not('author', 'is', null);
  const { count: withDate } = await sb.from('articles').select('*', { count: 'exact', head: true }).not('published_at', 'is', null);
  const { count: enriched } = await sb.from('articles').select('*', { count: 'exact', head: true }).not('ai_enriched_at', 'is', null);
  const { count: tagCount } = await sb.from('tags').select('*', { count: 'exact', head: true });
  const { count: personTags } = await sb.from('tags').select('*', { count: 'exact', head: true }).eq('type', 'person');
  const { count: articleTags } = await sb.from('article_tags').select('*', { count: 'exact', head: true });

  console.log('=== Overall ===');
  console.log(`Total: ${total} | Backfill: ${backfill} | Author: ${withAuthor} | Date: ${withDate} | Enriched: ${enriched}`);
  console.log(`Tags: ${tagCount} | Person tags: ${personTags} | Article-tag links: ${articleTags}`);
  console.log('');

  // Per-source breakdown
  const { data: sources } = await sb
    .from('sources')
    .select('id, name, slug, is_active')
    .order('name');

  if (!sources) return;

  console.log('=== By Source ===');
  console.log('Source'.padEnd(25) + 'Total'.padStart(7) + 'Backfill'.padStart(10) + 'Author'.padStart(8) + 'Date'.padStart(8) + 'Enriched'.padStart(10) + '  Active');
  console.log('-'.repeat(80));

  for (const src of sources) {
    const { count: sTotal } = await sb.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', src.id);
    const { count: sBackfill } = await sb.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', src.id).eq('is_backfill', true);
    const { count: sAuthor } = await sb.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', src.id).not('author', 'is', null);
    const { count: sDate } = await sb.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', src.id).not('published_at', 'is', null);
    const { count: sEnriched } = await sb.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', src.id).not('ai_enriched_at', 'is', null);

    if (sTotal === 0) continue;

    console.log(
      src.name.slice(0, 24).padEnd(25) +
      String(sTotal ?? 0).padStart(7) +
      String(sBackfill ?? 0).padStart(10) +
      String(sAuthor ?? 0).padStart(8) +
      String(sDate ?? 0).padStart(8) +
      String(sEnriched ?? 0).padStart(10) +
      '  ' + (src.is_active ? 'yes' : 'no')
    );
  }
}

run();
