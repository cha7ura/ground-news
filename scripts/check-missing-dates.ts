/**
 * Check Ada Derana articles missing published_at dates.
 * Usage: npx tsx scripts/check-missing-dates.ts
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
  // Find all Ada Derana EN articles without dates
  const adaEnId = '622a2e5f-806b-4695-9289-a9a9ff4973a0';

  const { data: noDate, count } = await supabase
    .from('articles')
    .select('id, title, url, content, created_at', { count: 'exact' })
    .eq('source_id', adaEnId)
    .is('published_at', null);

  console.log(`=== Ada Derana EN articles WITHOUT published_at: ${count} ===\n`);

  for (const a of noDate || []) {
    console.log(`Title: ${a.title?.slice(0, 70)}`);
    console.log(`URL: ${a.url}`);
    console.log(`Created: ${a.created_at}`);

    // Show first 500 chars of content to see if date is in there
    const contentPreview = a.content?.slice(0, 500) || 'NO CONTENT';
    console.log(`Content preview: ${contentPreview.slice(0, 200)}`);

    // Try to find date patterns in content
    const longDateRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;
    const dateOnlyRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i;
    const isoRe = /\b(\d{4})[-./](\d{2})[-./](\d{2})\b/;

    const m1 = a.content?.match(longDateRe);
    const m2 = a.content?.match(dateOnlyRe);
    const m3 = a.content?.match(isoRe);

    if (m1) console.log(`  Found date pattern 1 (long): "${m1[0]}"`);
    else if (m2) console.log(`  Found date pattern 2 (date-only): "${m2[0]}"`);
    else if (m3) console.log(`  Found date pattern 3 (iso): "${m3[0]}"`);
    else console.log(`  NO date pattern found in content`);

    console.log('');
  }

  // Also check newly ingested articles (today) to see if dates were captured
  const { data: today } = await supabase
    .from('articles')
    .select('title, url, published_at, created_at')
    .eq('source_id', adaEnId)
    .gte('created_at', new Date().toISOString().slice(0, 10))
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n=== Today\'s Ada Derana EN articles ===');
  for (const a of today || []) {
    console.log(`  ${a.title?.slice(0, 60)}`);
    console.log(`    published_at: ${a.published_at || 'NULL'}`);
    console.log(`    created_at: ${a.created_at}`);
  }
}

main().catch(console.error);
