/**
 * Extract published_at from article content (markdown) for sources
 * where metadata doesn't provide dates but the article body does.
 *
 * - Ada Derana: date appears as "January 30, 2017" near the top of markdown
 * - Also handles "DD Month YYYY" format found in some sources
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

let updated = 0;
let skipped = 0;

const DATE_PATTERNS = [
  // "January 30, 2017" or "December 5, 2025"
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
  // "30 January 2017" or "5 December 2025"
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
];

function extractDateFromContent(content: string): string | null {
  // Only search first 500 chars (date is near the top)
  const head = content.slice(0, 500);
  for (const pattern of DATE_PATTERNS) {
    const m = head.match(pattern);
    if (m) {
      try {
        const d = new Date(m[0]);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2015 && d.getFullYear() <= 2030) {
          return d.toISOString();
        }
      } catch {}
    }
  }
  return null;
}

async function fixFromContent(slug: string) {
  const { data: source } = await sb.from('sources').select('id').eq('slug', slug).single();
  if (!source) { console.log(`  ${slug}: not found`); return; }

  const { data: articles } = await sb
    .from('articles')
    .select('id, url, content')
    .eq('source_id', source.id)
    .is('published_at', null)
    .limit(1000);

  if (!articles || articles.length === 0) {
    console.log(`  ${slug}: no articles missing dates`);
    return;
  }
  console.log(`  ${slug}: ${articles.length} articles to check content for dates`);

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    if (!a.content) {
      console.log(`    ✗ [${i + 1}/${articles.length}] no content`);
      skipped++;
      continue;
    }

    const dateStr = extractDateFromContent(a.content);
    if (dateStr) {
      const { error } = await sb
        .from('articles')
        .update({ published_at: dateStr })
        .eq('id', a.id);
      if (error) {
        console.log(`    ✗ [${i + 1}/${articles.length}] DB error: ${error.message}`);
        skipped++;
      } else {
        updated++;
        console.log(`    ✓ [${i + 1}/${articles.length}] ${dateStr.slice(0, 10)}`);
      }
    } else {
      console.log(`    ✗ [${i + 1}/${articles.length}] no date in content`);
      skipped++;
    }
  }
}

(async () => {
  console.log('=== Date Backfill from Content ===\n');

  await fixFromContent('ada-derana-en');

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated} | Skipped: ${skipped}`);
})();
