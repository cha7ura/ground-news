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

const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';

async function scrapeMetadata(url: string): Promise<any> {
  try {
    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json() as any;
    return data.data?.metadata || {};
  } catch (err) {
    return { error: String(err) };
  }
}

(async () => {
  const { data: sources } = await sb.from('sources').select('id, slug, name');
  if (!sources) return;
  const srcMap = Object.fromEntries(sources.map((s: any) => [s.id, s]));

  // Get articles missing dates
  const { data: articles } = await sb
    .from('articles')
    .select('url, source_id')
    .is('published_at', null)
    .limit(2000);

  if (!articles || articles.length === 0) {
    console.log('No articles missing dates!');
    return;
  }

  console.log(`Total articles missing dates: ${articles.length}`);

  // Group by source
  const bySource: Record<string, string[]> = {};
  for (const a of articles) {
    const slug = srcMap[a.source_id]?.slug || 'unknown';
    if (!bySource[slug]) bySource[slug] = [];
    bySource[slug].push(a.url);
  }

  // Probe one sample per source
  for (const [slug, urls] of Object.entries(bySource).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n=== ${slug}: ${urls.length} missing dates ===`);
    console.log(`  sample URL: ${urls[0]}`);

    console.log(`  Probing Firecrawl metadata...`);
    const meta = await scrapeMetadata(urls[0]);
    console.log(`  metadata keys: ${Object.keys(meta).join(', ')}`);

    // Check for date-related metadata
    const dateKeys = Object.entries(meta).filter(([k, v]) =>
      (typeof v === 'string' && /20[0-9]{2}/.test(v as string)) ||
      k.toLowerCase().includes('date') ||
      k.toLowerCase().includes('time') ||
      k.toLowerCase().includes('publish')
    );
    if (dateKeys.length > 0) {
      console.log(`  date-related metadata:`);
      for (const [k, v] of dateKeys) {
        console.log(`    ${k}: ${v}`);
      }
    } else {
      console.log(`  NO date-related metadata found`);
    }

    // Check URL for date pattern
    const urlDateMatch = urls[0].match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (urlDateMatch) {
      console.log(`  URL contains date: ${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}`);
    }
  }
})();
