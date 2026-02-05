/**
 * Analyze missing dates for a specific source.
 * Usage: npx tsx scripts/check-source-dates.ts --slug the-island
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

const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';

function extractDateFromText(text: string): string | null {
  // Pattern 1: "Month DD, YYYY HH:MM am/pm"
  const longDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
  const m1 = text.match(longDateRe);
  if (m1) {
    try { const d = new Date(`${m1[1]} ${m1[2]}, ${m1[3]} ${m1[4]}`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
  }
  // Pattern 2: "Month DD, YYYY"
  const dateOnlyRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i;
  const m2 = text.match(dateOnlyRe);
  if (m2) {
    try { const d = new Date(`${m2[1]} ${m2[2]}, ${m2[3]}`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
  }
  // Pattern 3: YYYY-MM-DD
  const isoRe = /\b(\d{4})[-./](\d{2})[-./](\d{2})\b/;
  const m3 = text.match(isoRe);
  if (m3) {
    try { const d = new Date(`${m3[1]}-${m3[2]}-${m3[3]}T00:00:00+05:30`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
  }
  // Pattern 4: DD/MM/YYYY or DD-MM-YYYY
  const dmyRe = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/;
  const m4 = text.match(dmyRe);
  if (m4 && parseInt(m4[3]) >= 2006) {
    try { const d = new Date(`${m4[3]}-${m4[2].padStart(2,'0')}-${m4[1].padStart(2,'0')}T00:00:00+05:30`); if (!isNaN(d.getTime())) return d.toISOString(); } catch {}
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf('--slug');
  const slug = slugIdx !== -1 ? args[slugIdx + 1] : 'the-island';
  const fixDates = args.includes('--fix');
  const rescrape = args.includes('--rescrape');
  const sampleSize = 10;

  const { data: source } = await supabase.from('sources').select('*').eq('slug', slug).single();
  if (!source) { console.log('Source not found:', slug); return; }

  console.log(`=== ${source.name} (${slug}) ===\n`);

  // Get articles without dates
  const { data: noDate, count } = await supabase
    .from('articles')
    .select('id, title, url, content, created_at', { count: 'exact' })
    .eq('source_id', source.id)
    .is('published_at', null)
    .order('created_at', { ascending: false });

  console.log(`Articles without published_at: ${count}\n`);

  // Analyze sample
  let foundInContent = 0;
  let foundByRescrape = 0;
  let notFound = 0;

  for (const a of (noDate || []).slice(0, sampleSize)) {
    console.log(`Title: ${a.title?.slice(0, 60)}`);
    console.log(`  URL: ${a.url}`);

    // Try extracting date from existing content
    const contentDate = a.content ? extractDateFromText(a.content.slice(0, 3000)) : null;
    if (contentDate) {
      console.log(`  Found date in content: ${contentDate}`);
      foundInContent++;
      if (fixDates) {
        await supabase.from('articles').update({ published_at: contentDate }).eq('id', a.id);
        console.log(`  -> FIXED`);
      }
    } else if (rescrape) {
      // Try re-scraping for metadata
      console.log(`  Re-scraping...`);
      try {
        const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: a.url, formats: ['markdown'] }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json() as any;
        if (data.success) {
          const meta = data.data?.metadata || {};
          const rawDate = meta.publishedTime || meta['article:published_time'] || meta.dateModified;
          let scraperDate: string | null = null;
          if (rawDate) {
            try { const d = new Date(rawDate); if (!isNaN(d.getTime())) scraperDate = d.toISOString(); } catch {}
          }
          if (!scraperDate && data.data?.markdown) {
            scraperDate = extractDateFromText(data.data.markdown.slice(0, 3000));
          }

          if (scraperDate) {
            console.log(`  Found date by re-scraping: ${scraperDate}`);
            foundByRescrape++;
            if (fixDates) {
              await supabase.from('articles').update({ published_at: scraperDate }).eq('id', a.id);
              console.log(`  -> FIXED`);
            }
          } else {
            console.log(`  No date found even after re-scrape`);
            notFound++;
          }
        }
      } catch (e: any) {
        console.log(`  Re-scrape failed: ${e.message}`);
        notFound++;
      }
    } else {
      console.log(`  No date in content. Use --rescrape to try re-scraping`);
      notFound++;
    }
    console.log('');
  }

  console.log(`\n=== Summary (sample of ${Math.min(sampleSize, (noDate || []).length)}) ===`);
  console.log(`  Date found in content: ${foundInContent}`);
  if (rescrape) console.log(`  Date found by re-scrape: ${foundByRescrape}`);
  console.log(`  No date found: ${notFound}`);
  console.log(`\nUse --fix to actually update dates in DB`);
  console.log(`Use --rescrape to try re-scraping articles for metadata`);
}

main().catch(console.error);
