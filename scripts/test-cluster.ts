/**
 * Test story clustering: vector similarity + union-find grouping
 *
 * Usage: npx tsx scripts/test-cluster.ts [--threshold 0.80]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Load env.local
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Union-Find (Disjoint Set)
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;

    const rankX = this.rank.get(rx)!;
    const rankY = this.rank.get(ry)!;

    if (rankX < rankY) {
      this.parent.set(rx, ry);
    } else if (rankX > rankY) {
      this.parent.set(ry, rx);
    } else {
      this.parent.set(ry, rx);
      this.rank.set(rx, rankX + 1);
    }
  }

  getClusters(): Map<string, string[]> {
    const clusters = new Map<string, string[]>();
    for (const [node] of this.parent) {
      const root = this.find(node);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(node);
    }
    return clusters;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ArticleRow {
  id: string;
  title: string;
  source_id: string;
  published_at: string | null;
  embedding: string; // pgvector returns as string
}

async function main() {
  const args = process.argv.slice(2);
  let threshold = 0.80;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threshold' && args[i + 1]) threshold = parseFloat(args[++i]);
  }

  console.log(`\n${GREEN}▸${RESET} Test Story Clustering`);
  console.log(`  Similarity threshold: ${threshold}\n`);

  // 1. Get all articles with embeddings that haven't been clustered yet
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, source_id, published_at, embedding')
    .not('embedding', 'is', null)
    .is('story_id', null)
    .order('published_at', { ascending: false });

  if (error || !articles || articles.length === 0) {
    console.log(`${YELLOW}–${RESET} No unclustered articles with embeddings found`);
    process.exit(0);
  }

  console.log(`Found ${articles.length} unclustered articles with embeddings\n`);

  // 2. Parse embeddings from pgvector string format
  const parsed: Array<{ id: string; title: string; source_id: string; embedding: number[] }> = [];
  for (const a of articles as ArticleRow[]) {
    try {
      // pgvector returns "[0.1,0.2,...]" string
      const vec = JSON.parse(a.embedding) as number[];
      parsed.push({ id: a.id, title: a.title, source_id: a.source_id, embedding: vec });
    } catch {
      console.log(`${YELLOW}–${RESET} Skipping ${a.title.slice(0, 40)}... (bad embedding format)`);
    }
  }

  console.log(`Parsed ${parsed.length} embeddings\n`);

  // 3. Compute pairwise similarities and build union-find
  const uf = new UnionFind();
  const similarities: Array<{ a: string; b: string; sim: number }> = [];

  console.log(`${DIM}Computing pairwise similarities...${RESET}`);

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const sim = cosineSimilarity(parsed[i].embedding, parsed[j].embedding);
      if (sim >= threshold) {
        uf.union(parsed[i].id, parsed[j].id);
        similarities.push({ a: parsed[i].id, b: parsed[j].id, sim });
      }
    }
  }

  console.log(`Found ${similarities.length} pairs above threshold ${threshold}\n`);

  // Show top similarities
  if (similarities.length > 0) {
    console.log(`${BOLD}Top similar pairs:${RESET}`);
    const sorted = similarities.sort((a, b) => b.sim - a.sim).slice(0, 10);
    for (const { a, b, sim } of sorted) {
      const titleA = parsed.find(p => p.id === a)!.title.slice(0, 45);
      const titleB = parsed.find(p => p.id === b)!.title.slice(0, 45);
      console.log(`  ${GREEN}${sim.toFixed(3)}${RESET}  "${titleA}..." ↔ "${titleB}..."`);
    }
    console.log();
  }

  // 4. Get clusters (2+ articles only)
  const allClusters = uf.getClusters();
  const storyClusters = [...allClusters.entries()].filter(([, members]) => members.length >= 2);

  if (storyClusters.length === 0) {
    console.log(`${YELLOW}–${RESET} No clusters found with 2+ articles at threshold ${threshold}`);
    console.log(`${DIM}Try lowering the threshold: --threshold 0.75${RESET}\n`);

    // Show the closest pairs anyway
    const allPairs: Array<{ a: string; b: string; sim: number }> = [];
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const sim = cosineSimilarity(parsed[i].embedding, parsed[j].embedding);
        allPairs.push({ a: parsed[i].id, b: parsed[j].id, sim });
      }
    }
    allPairs.sort((a, b) => b.sim - a.sim);
    console.log(`${BOLD}Closest pairs (any threshold):${RESET}`);
    for (const { a, b, sim } of allPairs.slice(0, 5)) {
      const titleA = parsed.find(p => p.id === a)!.title.slice(0, 45);
      const titleB = parsed.find(p => p.id === b)!.title.slice(0, 45);
      console.log(`  ${sim >= 0.75 ? GREEN : YELLOW}${sim.toFixed(3)}${RESET}  "${titleA}..." ↔ "${titleB}..."`);
    }
    console.log();
    process.exit(0);
  }

  console.log(`${GREEN}▸${RESET} Found ${storyClusters.length} story clusters\n`);

  // 5. Create stories in Supabase
  // Get source names for bias distribution
  const { data: sources } = await supabase.from('sources').select('id, name, bias_score');
  const sourceMap = new Map((sources || []).map(s => [s.id, s]));

  let storiesCreated = 0;

  for (const [, memberIds] of storyClusters) {
    const clusterArticles = memberIds.map(id => parsed.find(p => p.id === id)!);
    const seedArticle = clusterArticles[0];

    // Get source names
    const clusterSources = [...new Set(clusterArticles.map(a => a.source_id))];
    const sourceNames = clusterSources.map(id => sourceMap.get(id)?.name || 'Unknown');

    // Calculate bias distribution
    let left = 0, center = 0, right = 0;
    for (const sid of clusterSources) {
      const bias = sourceMap.get(sid)?.bias_score || 0;
      if (bias < -0.3) left++;
      else if (bias > 0.3) right++;
      else center++;
    }

    console.log(`${BOLD}Story: "${seedArticle.title.slice(0, 60)}..."${RESET}`);
    console.log(`  Articles: ${memberIds.length}, Sources: ${sourceNames.join(', ')}`);
    console.log(`  Bias dist: left=${left}, center=${center}, right=${right}`);

    // Create story
    const { data: story, error: storyErr } = await supabase
      .from('stories')
      .insert({
        title: seedArticle.title,
        article_count: memberIds.length,
        source_count: clusterSources.length,
        bias_distribution: { left, center, right },
        is_active: true,
      })
      .select()
      .single();

    if (storyErr || !story) {
      console.log(`  ${RED}✗ Failed to create story: ${storyErr?.message}${RESET}\n`);
      continue;
    }

    // Link articles to story
    for (const articleId of memberIds) {
      await supabase.from('articles').update({ story_id: story.id }).eq('id', articleId);
      await supabase.from('story_articles').insert({
        story_id: story.id,
        article_id: articleId,
        is_seed_article: articleId === seedArticle.id,
      });
    }

    console.log(`  ${GREEN}✓${RESET} Created story ${story.id.slice(0, 8)}...\n`);
    storiesCreated++;
  }

  // Summary
  const { count: storyCount } = await supabase
    .from('stories')
    .select('*', { count: 'exact', head: true });

  const { count: clusteredCount } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .not('story_id', 'is', null);

  console.log(`${GREEN}▸${RESET} Results: ${storiesCreated} stories created`);
  console.log(`  Total stories: ${storyCount || 0}`);
  console.log(`  Clustered articles: ${clusteredCount || 0} / 25\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
