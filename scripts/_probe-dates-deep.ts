/**
 * Deep probe: check 5 sample articles per unresolved source
 * for any date info in metadata, HTML, or markdown content.
 */
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

async function scrapeAll(url: string): Promise<{ metadata: any; markdown: string }> {
  try {
    const res = await fetch(`${firecrawlUrl}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json() as any;
    return {
      metadata: data.data?.metadata || {},
      markdown: data.data?.markdown || '',
    };
  } catch (err) {
    return { metadata: { error: String(err) }, markdown: '' };
  }
}

// Unresolved sources: lankadeepa, daily-ft, ada-derana-en
const UNRESOLVED = ['lankadeepa', 'daily-ft', 'ada-derana-en'];

(async () => {
  for (const slug of UNRESOLVED) {
    const { data: source } = await sb.from('sources').select('id').eq('slug', slug).single();
    if (!source) { console.log(`${slug}: not found`); continue; }

    const { data: articles } = await sb
      .from('articles')
      .select('id, url, title')
      .eq('source_id', source.id)
      .is('published_at', null)
      .limit(5);

    if (!articles || articles.length === 0) {
      console.log(`\n=== ${slug}: no articles missing dates ===`);
      continue;
    }

    console.log(`\n=== ${slug}: probing ${articles.length} samples ===`);

    for (const a of articles) {
      console.log(`\n  URL: ${a.url}`);
      console.log(`  Title: ${a.title?.slice(0, 60)}`);

      const { metadata, markdown } = await scrapeAll(a.url);

      // Check all metadata for date-related fields
      const dateFields = Object.entries(metadata).filter(([k, v]) => {
        if (typeof v !== 'string') return false;
        return k.toLowerCase().includes('date') ||
               k.toLowerCase().includes('time') ||
               k.toLowerCase().includes('publish') ||
               k.toLowerCase().includes('modified') ||
               /\d{4}-\d{2}-\d{2}/.test(v as string);
      });

      if (dateFields.length > 0) {
        console.log('  Metadata date fields:');
        for (const [k, v] of dateFields) {
          console.log(`    ${k}: ${v}`);
        }
      } else {
        console.log('  No date metadata fields');
      }

      // Search markdown content for date patterns
      const datePatterns = [
        /(\d{4}-\d{2}-\d{2})/g,
        /(\d{1,2}[\s\/\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\/\-]\d{4})/gi,
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi,
        /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi,
        /(December|January|November)\s+\d{1,2},?\s+\d{4}/gi,
      ];

      const mdDates = new Set<string>();
      for (const pattern of datePatterns) {
        let m: RegExpExecArray | null;
        const re = new RegExp(pattern.source, pattern.flags);
        while ((m = re.exec(markdown)) !== null) {
          mdDates.add(m[0]);
        }
      }

      if (mdDates.size > 0) {
        console.log(`  Dates found in markdown content:`);
        Array.from(mdDates).slice(0, 5).forEach(d => console.log(`    "${d}"`));
      } else {
        console.log('  No dates found in markdown content');
      }

      // Show first 200 chars of markdown for context
      console.log(`  Markdown preview: ${markdown.slice(0, 200).replace(/\n/g, ' ')}`);
    }
  }
})();
