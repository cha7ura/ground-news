/**
 * Fix missing published_at dates by re-scraping article metadata.
 * Works for any source — extracts dates from page metadata and content.
 *
 * Usage:
 *   npx tsx scripts/fix-missing-dates.ts --slug the-island
 *   npx tsx scripts/fix-missing-dates.ts --slug the-island --batch 50
 *   npx tsx scripts/fix-missing-dates.ts --slug the-island --dry-run
 *   npx tsx scripts/fix-missing-dates.ts --slug lankadeepa --batch 100
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
  // Pattern 4: "DD Month YYYY" (e.g., "4 February 2026")
  const dmyLongRe = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i;
  const m4 = text.match(dmyLongRe);
  if (m4) {
    try { const d = new Date(`${m4[2]} ${m4[1]}, ${m4[3]}`); if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) return d.toISOString(); } catch {}
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

    // Try metadata date fields
    const rawDate = meta.publishedTime
      || meta['article:published_time']
      || meta.dateModified
      || meta.modifiedTime
      || meta['article:modified_time']
      || meta.datePublished;

    let date: string | null = null;
    if (rawDate) {
      // Handle formats like "2025-12-29 11:48 pm"
      const cleaned = rawDate.replace(/\s+(am|pm)/i, ' $1');
      try {
        const d = new Date(cleaned);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2006) date = d.toISOString();
      } catch {}
    }

    // Fallback: extract from page text
    if (!date && data.data?.markdown) {
      date = extractDateFromText(data.data.markdown.slice(0, 3000));
    }

    // Author
    const author = meta.author || meta['article:author'] || null;

    return { date, author };
  } catch {
    return { date: null, author: null };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf('--slug');
  const slug = slugIdx !== -1 ? args[slugIdx + 1] : '';
  const batchIdx = args.indexOf('--batch');
  const batchSize = batchIdx !== -1 ? parseInt(args[batchIdx + 1] || '50', 10) : 50;
  const dryRun = args.includes('--dry-run');

  if (!slug) {
    console.log('Usage: npx tsx scripts/fix-missing-dates.ts --slug <source-slug> [--batch N] [--dry-run]');
    return;
  }

  const { data: source } = await supabase.from('sources').select('*').eq('slug', slug).single();
  if (!source) { console.log(`Source '${slug}' not found`); return; }

  console.log(`${BOLD}Fix Missing Dates: ${source.name}${RESET}${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Get articles without dates
  const { data: noDate, count } = await supabase
    .from('articles')
    .select('id, url, title, content', { count: 'exact' })
    .eq('source_id', source.id)
    .is('published_at', null)
    .order('created_at', { ascending: false })
    .limit(batchSize);

  console.log(`Articles without dates: ${count} total, processing ${Math.min(batchSize, count || 0)}\n`);

  if (!noDate || noDate.length === 0) {
    console.log(`${GREEN}✓${RESET} No articles without dates!`);
    return;
  }

  let fixed = 0;
  let failedScrape = 0;
  let noDateFound = 0;

  for (let i = 0; i < noDate.length; i++) {
    const a = noDate[i];
    console.log(`  ${DIM}[${i + 1}/${noDate.length}]${RESET} ${a.title?.slice(0, 55) || 'Untitled'}...`);

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
      const dateStr = new Date(date).toLocaleDateString();
      if (!dryRun) {
        const update: any = { published_at: date };
        if (author && !a.title?.includes(author)) update.author = author; // Don't overwrite if already set
        await supabase.from('articles').update(update).eq('id', a.id);
      }
      console.log(`    ${GREEN}✓${RESET} ${dateStr}${author ? ` by ${author}` : ''}${dryRun ? ' (dry run)' : ''}`);
      fixed++;
    } else {
      console.log(`    ${RED}✗${RESET} No date found`);
      noDateFound++;
    }

    // Rate limit
    if (i % 5 === 4) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n${BOLD}Results:${RESET}`);
  console.log(`  ${GREEN}✓${RESET} Fixed: ${fixed}`);
  console.log(`  ${RED}✗${RESET} No date found: ${noDateFound}`);
  console.log(`  Remaining without dates: ${(count || 0) - fixed}`);

  // Show updated stats
  if (!dryRun && fixed > 0) {
    const { count: total } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', source.id);
    const { count: withDate } = await supabase.from('articles').select('*', { count: 'exact', head: true }).eq('source_id', source.id).not('published_at', 'is', null);
    console.log(`\n  Total: ${total} | With date: ${withDate} | Missing: ${(total || 0) - (withDate || 0)}`);
  }
}

main().catch(console.error);
