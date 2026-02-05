/**
 * Tag articles with crime-category tags (drugs, shootings, robbery, etc.)
 * based on their topics, title, and content keywords.
 *
 * Also ensures location tags are linked where possible by cross-referencing
 * article entities with the sri_lanka_locations table.
 *
 * Usage:
 *   npx tsx scripts/tag-incidents.ts
 *   npx tsx scripts/tag-incidents.ts --dry-run
 *   npx tsx scripts/tag-incidents.ts --limit 500
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

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ============================================
// Crime category definitions
// ============================================
interface CrimeCategory {
  slug: string;
  name: string;
  name_si: string;
  keywords: RegExp;
}

const CRIME_CATEGORIES: CrimeCategory[] = [
  {
    slug: 'drugs',
    name: 'Drug Offences',
    name_si: 'මත්ද්‍රව්‍ය වැරදි',
    keywords: /\b(drug|narcotic|heroin|cocaine|cannabis|marijuana|ganja|ice|methamphetamine|ketamine|mdma|ecstasy|meth|opium|hashish|drug bust|drug raid|drug trafficking|drug dealer|drug lord|drug smuggl|narco|මත්ද්‍රව්‍ය|හෙරොයින්|ගංජා)\b/i,
  },
  {
    slug: 'shooting',
    name: 'Shootings',
    name_si: 'වෙඩි තැබීම්',
    keywords: /\b(shoot|shooting|shot dead|gunshot|gun|firearm|opened fire|gunfire|shot at|killed.*gun|වෙඩි|වෙඩි තැබී)\b/i,
  },
  {
    slug: 'murder',
    name: 'Murder & Homicide',
    name_si: 'ඝාතන',
    keywords: /\b(murder|homicide|killed|slain|stabbed to death|beaten to death|strangled|hacked to death|ඝාතන|මරා දැමී)\b/i,
  },
  {
    slug: 'robbery',
    name: 'Robbery & Theft',
    name_si: 'මංකොල්ල සහ සොරකම්',
    keywords: /\b(robbery|robbed|theft|stolen|burglary|burglar|break.?in|heist|loot|pickpocket|snatch|සොරකම|මංකොල්ල)\b/i,
  },
  {
    slug: 'assault',
    name: 'Assault',
    name_si: 'පහරදීම',
    keywords: /\b(assault|assaulted|attack|attacked|beaten|beat up|stabbed|stabbing|battered|violent|පහරදී|පිහි)\b/i,
  },
  {
    slug: 'kidnapping',
    name: 'Kidnapping & Abduction',
    name_si: 'පැහැරගැනීම්',
    keywords: /\b(kidnap|kidnapped|abduct|abducted|held hostage|ransom|පැහැරගැනී)\b/i,
  },
  {
    slug: 'fraud',
    name: 'Fraud & Scams',
    name_si: 'වංචා',
    keywords: /\b(fraud|scam|swindl|embezzl|forgery|counterfeit|ponzi|cheating|money laundering|වංචා)\b/i,
  },
  {
    slug: 'corruption',
    name: 'Corruption',
    name_si: 'දූෂණය',
    keywords: /\b(corruption|corrupt|bribe|bribery|kickback|graft|දූෂණ)\b/i,
  },
  {
    slug: 'smuggling',
    name: 'Smuggling',
    name_si: 'කොන්ත්‍රබෑන්ඩ්',
    keywords: /\b(smuggl|contraband|illegal.*import|illegal.*export|customs.*seized|තොගය අත්අඩංගු)\b/i,
  },
  {
    slug: 'sexual-assault',
    name: 'Sexual Assault',
    name_si: 'ලිංගික අපචාර',
    keywords: /\b(rape|raped|sexual.*assault|sexual.*abuse|molestation|indecent|ලිංගික අපචාර)\b/i,
  },
  {
    slug: 'arson',
    name: 'Arson',
    name_si: 'ගිනිතැබීම',
    keywords: /\b(arson|set.*fire|set.*ablaze|torched|firebomb|ගිනි තැබී)\b/i,
  },
  {
    slug: 'human-trafficking',
    name: 'Human Trafficking',
    name_si: 'මිනිස් ජාවාරම',
    keywords: /\b(human.*trafficking|traffick.*person|forced.*labor|sex.*trafficking|මිනිස් ජාවාරම)\b/i,
  },
];

// ============================================
// Law enforcement / military organization patterns
// ============================================
interface OrgCategory {
  slug: string;
  name: string;
  name_si: string;
  type: 'organization';
  keywords: RegExp;
}

const LAW_ENFORCEMENT_ORGS: OrgCategory[] = [
  {
    slug: 'police',
    name: 'Sri Lanka Police',
    name_si: 'ශ්‍රී ලංකා පොලිසිය',
    type: 'organization',
    keywords: /\b(police|polic|cop|constable|SP |DIG |SSP |ASP |OIC|officer in charge|පොලිස|පොලීසිය)\b/i,
  },
  {
    slug: 'sri-lanka-army',
    name: 'Sri Lanka Army',
    name_si: 'ශ්‍රී ලංකා යුද්ධ හමුදාව',
    type: 'organization',
    keywords: /\b(army|soldier|military|troops|barracks|යුද්ධ හමුදා)\b/i,
  },
  {
    slug: 'sri-lanka-navy',
    name: 'Sri Lanka Navy',
    name_si: 'ශ්‍රී ලංකා නාවික හමුදාව',
    type: 'organization',
    keywords: /\b(navy|naval|නාවික හමුදා)\b/i,
  },
  {
    slug: 'cid',
    name: 'Criminal Investigation Department',
    name_si: 'අපරාධ පරීක්ෂණ දෙපාර්තමේන්තුව',
    type: 'organization',
    keywords: /\b(CID|Criminal Investigation Department)\b/i,
  },
  {
    slug: 'stf',
    name: 'Special Task Force',
    name_si: 'විශේෂ කාර්ය බලකාය',
    type: 'organization',
    keywords: /\b(STF|Special Task Force|විශේෂ කාර්ය බලකා)\b/i,
  },
  {
    slug: 'police-narcotics-bureau',
    name: 'Police Narcotics Bureau',
    name_si: 'පොලිස් මත්ද්‍රව්‍ය කාර්යාංශය',
    type: 'organization',
    keywords: /\b(PNB|Police Narcotics Bureau|Narcotics Bureau)\b/i,
  },
];

// Police station regex: matches "Xxxx Police" patterns
const POLICE_STATION_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+Police\b/g;

// ============================================
// Ensure crime category tags exist
// ============================================
async function ensureCrimeTags(): Promise<Map<string, string>> {
  const tagMap = new Map<string, string>(); // slug -> id

  for (const cat of CRIME_CATEGORIES) {
    const { data: existing } = await supabase
      .from('tags')
      .select('id, slug')
      .eq('slug', cat.slug)
      .single();

    if (existing) {
      tagMap.set(cat.slug, existing.id);
    } else {
      const { data: created, error } = await supabase
        .from('tags')
        .insert({
          name: cat.name,
          name_si: cat.name_si,
          slug: cat.slug,
          type: 'topic',
          is_active: true,
          created_by: 'script',
        })
        .select('id')
        .single();

      if (error) {
        console.log(`  ${RED}✗${RESET} Failed to create tag "${cat.slug}": ${error.message}`);
      } else if (created) {
        tagMap.set(cat.slug, created.id);
        console.log(`  ${GREEN}✓${RESET} Created tag: ${cat.name} (${cat.slug})`);
      }
    }
  }

  return tagMap;
}

// ============================================
// Load Sri Lanka location names for matching
// ============================================
async function loadLocationNames(): Promise<Map<string, { slug: string; tagId: string | null }>> {
  const locations = new Map<string, { slug: string; tagId: string | null }>();

  // Get location names from sri_lanka_locations
  const { data: slLocations } = await supabase
    .from('sri_lanka_locations')
    .select('name, name_si, slug');

  if (slLocations) {
    for (const loc of slLocations) {
      locations.set(loc.name.toLowerCase(), { slug: loc.slug, tagId: null });
      if (loc.name_si) {
        locations.set(loc.name_si, { slug: loc.slug, tagId: null });
      }
    }
  }

  // Pre-fetch existing location tags
  const { data: locationTags } = await supabase
    .from('tags')
    .select('id, slug')
    .eq('type', 'location')
    .eq('is_active', true);

  if (locationTags) {
    for (const tag of locationTags) {
      for (const [key, val] of locations) {
        if (val.slug === tag.slug) {
          locations.set(key, { ...val, tagId: tag.id });
        }
      }
    }
  }

  return locations;
}

// ============================================
// Match locations in article text
// ============================================
function findLocationsInText(
  text: string,
  locationMap: Map<string, { slug: string; tagId: string | null }>
): Array<{ slug: string; tagId: string | null }> {
  const found: Array<{ slug: string; tagId: string | null }> = [];
  const seen = new Set<string>();

  for (const [name, info] of locationMap) {
    if (seen.has(info.slug)) continue;
    // Match word boundaries for English names, direct match for Sinhala
    const isEnglish = /^[a-z]/.test(name);
    if (isEnglish) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) {
        found.push(info);
        seen.add(info.slug);
      }
    } else {
      if (text.includes(name)) {
        found.push(info);
        seen.add(info.slug);
      }
    }
  }

  return found;
}

// ============================================
// Main
// ============================================
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] || '1000', 10) : 1000;

  console.log(`${BOLD}Incident Tagger${RESET}${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Step 1: Ensure crime category tags exist
  console.log(`${BOLD}Step 1:${RESET} Ensuring crime category tags...`);
  const crimeTagMap = await ensureCrimeTags();
  console.log(`  ${crimeTagMap.size} crime tags ready\n`);

  // Step 2: Load location names
  console.log(`${BOLD}Step 2:${RESET} Loading Sri Lanka locations...`);
  const locationMap = await loadLocationNames();
  console.log(`  ${locationMap.size} location names loaded\n`);

  // Step 3: Get crime-topic articles that need tagging
  console.log(`${BOLD}Step 3:${RESET} Finding crime articles to tag...\n`);

  // Get articles with crime topic OR that haven't been incident-tagged yet
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, topics, url')
    .not('ai_enriched_at', 'is', null)
    .not('content', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error || !articles) {
    console.log(`${RED}Error fetching articles:${RESET} ${error?.message}`);
    return;
  }

  console.log(`Processing ${articles.length} enriched articles...\n`);

  let crimeTagged = 0;
  let locationTagged = 0;
  let skipped = 0;

  for (const article of articles) {
    const searchText = `${article.title}\n${(article.content || '').slice(0, 5000)}`;
    const hasCrimeTopic = (article.topics || []).some((t: string) =>
      /crime|law|court|police|arrest/i.test(t)
    );

    // Match crime categories
    const matchedCategories: string[] = [];
    for (const cat of CRIME_CATEGORIES) {
      if (cat.keywords.test(searchText)) {
        matchedCategories.push(cat.slug);
      }
    }

    // Skip if no crime detected
    if (matchedCategories.length === 0 && !hasCrimeTopic) {
      skipped++;
      continue;
    }

    // For articles with crime topic but no specific category, tag as generic "crime"
    if (matchedCategories.length === 0 && hasCrimeTopic) {
      // We don't force a generic tag; skip — the enrichment pipeline already has "crime" as a topic
      skipped++;
      continue;
    }

    const titlePreview = article.title?.slice(0, 55) || 'Untitled';

    // Tag with crime categories
    for (const catSlug of matchedCategories) {
      const tagId = crimeTagMap.get(catSlug);
      if (!tagId) continue;

      if (!dryRun) {
        await supabase
          .from('article_tags')
          .upsert(
            { article_id: article.id, tag_id: tagId, confidence: 0.85, source: 'ai' },
            { onConflict: 'article_id,tag_id' }
          );
      }
    }

    console.log(`  ${GREEN}✓${RESET} ${titlePreview}... → ${matchedCategories.join(', ')}`);
    crimeTagged++;

    // Match and tag locations
    const locations = findLocationsInText(searchText, locationMap);
    for (const loc of locations) {
      let tagId = loc.tagId;

      // Create location tag if it doesn't exist
      if (!tagId && !dryRun) {
        // Look up the location details
        const { data: slLoc } = await supabase
          .from('sri_lanka_locations')
          .select('*')
          .eq('slug', loc.slug)
          .single();

        if (slLoc) {
          const { data: newTag } = await supabase
            .from('tags')
            .upsert(
              {
                name: slLoc.name,
                name_si: slLoc.name_si,
                slug: slLoc.slug,
                type: 'location',
                latitude: slLoc.latitude,
                longitude: slLoc.longitude,
                district: slLoc.district,
                province: slLoc.province,
                is_active: true,
                created_by: 'script',
              },
              { onConflict: 'slug' }
            )
            .select('id')
            .single();

          if (newTag) tagId = newTag.id;
        }
      }

      if (tagId && !dryRun) {
        await supabase
          .from('article_tags')
          .upsert(
            { article_id: article.id, tag_id: tagId, confidence: 0.8, source: 'ai' },
            { onConflict: 'article_id,tag_id' }
          );
        locationTagged++;
      }
    }

    if (locations.length > 0) {
      console.log(`    ${DIM}Locations: ${locations.map(l => l.slug).join(', ')}${RESET}`);
    }

    // Match and tag law enforcement organizations
    const matchedOrgs: string[] = [];
    for (const org of LAW_ENFORCEMENT_ORGS) {
      if (org.keywords.test(searchText)) {
        matchedOrgs.push(org.slug);

        if (!dryRun) {
          const { data: orgTag } = await supabase
            .from('tags')
            .upsert(
              { name: org.name, name_si: org.name_si, slug: org.slug, type: 'organization', is_active: true, created_by: 'script' },
              { onConflict: 'slug' }
            )
            .select('id')
            .single();

          if (orgTag) {
            await supabase.from('article_tags').upsert(
              { article_id: article.id, tag_id: orgTag.id, confidence: 0.85, source: 'ai' },
              { onConflict: 'article_id,tag_id' }
            );
          }
        }
      }
    }

    // Extract police station names (e.g., "Kelaniya Police", "Colombo Fort Police")
    const stationMatches = searchText.matchAll(POLICE_STATION_RE);
    const stationNames = new Set<string>();
    for (const m of stationMatches) {
      const stationName = `${m[1]} Police`;
      // Skip generic matches like "The Police", "Sri Police"
      if (/^(The|A|An|Sri|No|One|Each)$/i.test(m[1])) continue;
      stationNames.add(stationName);
    }

    for (const stationName of stationNames) {
      const stationSlug = stationName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      if (!dryRun) {
        const { data: stTag } = await supabase
          .from('tags')
          .upsert(
            { name: stationName, slug: stationSlug, type: 'organization', is_active: true, created_by: 'script' },
            { onConflict: 'slug' }
          )
          .select('id')
          .single();

        if (stTag) {
          await supabase.from('article_tags').upsert(
            { article_id: article.id, tag_id: stTag.id, confidence: 0.9, source: 'ai' },
            { onConflict: 'article_id,tag_id' }
          );
        }
      }
    }

    if (matchedOrgs.length > 0 || stationNames.size > 0) {
      const parts: string[] = [];
      if (matchedOrgs.length > 0) parts.push(`Orgs: ${matchedOrgs.join(', ')}`);
      if (stationNames.size > 0) parts.push(`Stations: ${[...stationNames].join(', ')}`);
      console.log(`    ${DIM}${parts.join(' | ')}${RESET}`);
    }
  }

  // Summary
  console.log(`\n${BOLD}Results:${RESET}`);
  console.log(`  ${GREEN}✓${RESET} Crime-tagged: ${crimeTagged} articles`);
  console.log(`  ${GREEN}✓${RESET} Location links: ${locationTagged}`);
  console.log(`  ${DIM}Skipped (no crime match): ${skipped}${RESET}`);

  // Show tag counts
  console.log(`\n${BOLD}Tag counts:${RESET}`);
  for (const [slug, tagId] of crimeTagMap) {
    const { count } = await supabase
      .from('article_tags')
      .select('*', { count: 'exact', head: true })
      .eq('tag_id', tagId);
    if (count && count > 0) {
      console.log(`  ${slug}: ${count} articles`);
    }
  }
}

main().catch(console.error);
