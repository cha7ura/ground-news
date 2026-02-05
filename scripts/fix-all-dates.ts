/**
 * Fix missing published_at dates across ALL sources.
 * Iterates through every active source and attempts to extract dates
 * from existing content or by re-scraping via Firecrawl.
 *
 * Usage:
 *   npx tsx scripts/fix-all-dates.ts
 *   npx tsx scripts/fix-all-dates.ts --batch 100
 *   npx tsx scripts/fix-all-dates.ts --dry-run
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

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function extractDateFromText(text: string): string | null {
  const longDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
  const m1 = text.match(longDateRe);
  if (m1) {
    try { const d = new Date(`${m1[1]} ${m1[2]}, ${m1[3]} ${m1[4]}`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
  }
  const dateOnlyRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i;
  const m2 = text.match(dateOnlyRe);
  if (m2) {
    try { const d = new Date(`${m2[1]} ${m2[2]}, ${m2[3]}`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
  }
  const isoRe = /\b(\d{4})[-./](\d{2})[-./](\d{2})\b/;
  const m3 = text.match(isoRe);
  if (m3) {
    try { const d = new Date(`${m3[1]}-${m3[2]}-${m3[3]}T00:00:00+05:30`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
  }
  const dmyLongRe = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i;
  const m4 = text.match(dmyLongRe);
  if (m4) {
    try { const d = new Date(`${m4[2]} ${m4[1]}, ${m4[3]}`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
  }
  const dmyNumRe = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/;
  const m5 = text.match(dmyNumRe);
  if (m5 && parseInt(m5[3]) >= 2006) {
    try { const d = new Date(`${m5[3]}-${m5[2].padStart(2,'0')}-${m5[1].padStart(2,'0')}T00:00:00+05:30`); if (!isNaN(d.getTime())) return d.toISOString(); } catch {}
  }
  return null;
}

async function scrapeMetadataDate(url: string): Promise<{ date: string | null; author: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json() as any;
    if (!data.success) return { date: null, author: null };

    const meta = data.data?.metadata || {};
    const rawDate = meta.publishedTime
      || meta['article:published_time']
      || meta.dateModified
      || meta.modifiedTime
      || meta['article:modified_time']
      || meta.datePublished;

    let date: string | null = null;
    if (rawDate) {
      const cleaned = rawDate.replace(/\s+(am|pm)/i, ' $1');
      try { const d = new Date(cleaned); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) date = d.toISOString(); } catch {}
    }
    if (!date && data.data?.markdown) {
      date = extractDateFromText(data.data.markdown.slice(0, 3000));
    }

    // URL path date fallback
    if (!date) {
      const urlMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (urlMatch) date = `${urlMatch[1]}-${urlMatch[2]}-${urlMatch[3]}T00:00:00+05:30`;
    }

    const author = meta.author || meta['article:author'] || null;
    return { date, author };
  } catch {
    return { date: null, author: null };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf('--batch');
  const batchSize = batchIdx !== -1 ? parseInt(args[batchIdx + 1] || '50', 10) : 50;
  const dryRun = args.includes('--dry-run');

  console.log(`${BOLD}Fix Missing Dates — All Sources${RESET}${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Get all active sources
  const { data: sources } = await supabase
    .from('sources')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('name');

  if (!sources || sources.length === 0) {
    console.log('No active sources found');
    return;
  }

  let totalFixed = 0;
  let totalRemaining = 0;

  for (const source of sources) {
    const { count } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', source.id)
      .is('published_at', null);

    if (!count || count === 0) {
      console.log(`${GREEN}✓${RESET} ${source.name}: no missing dates`);
      continue;
    }

    console.log(`\n${BOLD}${source.name}${RESET} (${source.slug}) — ${count} articles without dates`);

    const { data: noDate } = await supabase
      .from('articles')
      .select('id, url, title, content')
      .eq('source_id', source.id)
      .is('published_at', null)
      .order('created_at', { ascending: false })
      .limit(batchSize);

    if (!noDate || noDate.length === 0) continue;

    let fixed = 0;
    for (let i = 0; i < noDate.length; i++) {
      const a = noDate[i];

      // Step 1: Try extracting date from existing content
      let date: string | null = null;
      let author: string | null = null;
      if (a.content) {
        date = extractDateFromText(a.content.slice(0, 3000));
      }

      // Step 2: If no date in content, re-scrape
      if (!date) {
        const result = await scrapeMetadataDate(a.url);
        date = result.date;
        author = result.author;
      }

      if (date) {
        if (!dryRun) {
          const update: any = { published_at: date };
          if (author) update.author = author;
          await supabase.from('articles').update(update).eq('id', a.id);
        }
        console.log(`  ${GREEN}✓${RESET} ${a.title?.slice(0, 50)}... → ${new Date(date).toLocaleDateString()}`);
        fixed++;
      }

      // Rate limit
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 1000));
    }

    totalFixed += fixed;
    totalRemaining += (count - fixed);
    console.log(`  Fixed: ${fixed}/${noDate.length} | Remaining: ${count - fixed}`);
  }

  console.log(`\n${BOLD}Grand Total:${RESET}`);
  console.log(`  ${GREEN}✓${RESET} Fixed: ${totalFixed}`);
  console.log(`  Remaining: ${totalRemaining}`);
}

main().catch(console.error);
