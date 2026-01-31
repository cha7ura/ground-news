/**
 * News pipeline orchestrator — replaces n8n workflows with plain TypeScript.
 *
 * Usage:
 *   npx tsx scripts/pipeline.ts --ingest             # ingest from all active RSS sources
 *   npx tsx scripts/pipeline.ts --enrich             # enrich unenriched articles
 *   npx tsx scripts/pipeline.ts --cluster            # cluster enriched articles into stories
 *   npx tsx scripts/pipeline.ts --graph              # sync enriched articles to Graphiti knowledge graph
 *   npx tsx scripts/pipeline.ts --all                # run full pipeline (ingest → enrich → graph → cluster)
 *   npx tsx scripts/pipeline.ts --daemon             # run on schedule (ingest 2h, enrich 3h, cluster 6h)
 *
 * Options:
 *   --limit N       Max articles per source for ingest / per batch for enrich (default: 20)
 *   --threshold N   Cosine similarity threshold for clustering (default: 0.80)
 *   --llm ollama    Use Ollama (qwen3:1.7b) instead of OpenRouter for LLM analysis
 *   --llm openrouter Use OpenRouter (default)
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const firecrawlUrl = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';
const openrouterKey = process.env.OPENROUTER_API_KEY!;
const openrouterModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
const ollamaLlmModel = process.env.OLLAMA_LLM_MODEL || 'qwen3:1.7b';
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b';
const embeddingDims = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);
const graphitiUrl = process.env.GRAPHITI_API_URL || 'http://localhost:8000';

// LLM provider: 'openrouter' or 'ollama' — set via --llm flag or LLM_PROVIDER env var
let llmProvider: 'openrouter' | 'ollama' = (process.env.LLM_PROVIDER as 'openrouter' | 'ollama') || 'openrouter';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function timestamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function log(msg: string) {
  console.log(`${DIM}[${timestamp()}]${RESET} ${msg}`);
}

// ===========================================================================
// STEP 1: INGEST
// ===========================================================================

interface RSSItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
  imageUrl: string | null;
}

async function fetchRSS(rssUrl: string): Promise<RSSItem[]> {
  const res = await fetch(rssUrl);
  const buffer = await res.arrayBuffer();

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('iso-8859-1').decode(buffer);
  }

  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(text)) !== null) {
    const xml = match[1];
    const getTag = (tag: string): string | null => {
      const m = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : null;
    };

    const title = getTag('title') || 'Untitled';
    const link = getTag('link') || getTag('guid') || '';
    const pubDate = getTag('pubDate');
    const description = getTag('description');

    let imageUrl: string | null = null;
    if (description) {
      const imgMatch = description.match(/src=['"](https?:\/\/[^'"]+)['"]/i);
      if (imgMatch) imageUrl = imgMatch[1];
    }

    // Filter to 2026 only
    if (pubDate) {
      try {
        if (new Date(pubDate).getFullYear() < 2026) continue;
      } catch {}
    }

    if (link) {
      items.push({ title, link, pubDate, description, imageUrl });
    }
  }

  return items;
}

async function scrapeArticle(url: string): Promise<{ markdown: string; title: string | null } | null> {
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

    const data = await res.json() as {
      success: boolean;
      data?: { markdown?: string; metadata?: { title?: string } };
    };

    if (!data.success || !data.data?.markdown) return null;
    return { markdown: data.data.markdown, title: data.data.metadata?.title || null };
  } catch {
    return null;
  }
}

async function runIngest(limit: number): Promise<number> {
  log(`${BOLD}INGEST${RESET} — fetching articles from all active RSS sources`);

  const { data: sources, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_active', true)
    .not('rss_url', 'is', null);

  if (error || !sources || sources.length === 0) {
    log(`${YELLOW}–${RESET} No active sources with RSS found`);
    return 0;
  }

  log(`Found ${sources.length} active RSS sources`);
  let totalInserted = 0;

  for (const source of sources) {
    log(`${DIM}Source: ${source.name} (${source.slug})${RESET}`);

    let rssItems: RSSItem[];
    try {
      rssItems = await fetchRSS(source.rss_url);
    } catch (err) {
      log(`  ${RED}✗${RESET} RSS fetch failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    if (rssItems.length === 0) {
      log(`  ${YELLOW}–${RESET} No items in RSS feed`);
      continue;
    }

    // Deduplicate against existing URLs
    const urls = rssItems.slice(0, limit).map(i => i.link);
    const { data: existing } = await supabase
      .from('articles')
      .select('url')
      .in('url', urls);
    const existingUrls = new Set((existing || []).map(a => a.url));

    let inserted = 0;
    for (const item of rssItems.slice(0, limit)) {
      if (existingUrls.has(item.link)) continue;

      const scraped = await scrapeArticle(item.link);
      if (!scraped || scraped.markdown.length < 100) {
        log(`  ${RED}✗${RESET} ${item.title.slice(0, 50)}... (scrape failed)`);
        continue;
      }

      let publishedAt: string | null = null;
      if (item.pubDate) {
        try { publishedAt = new Date(item.pubDate).toISOString(); } catch {}
      }

      const { error: insertErr } = await supabase.from('articles').insert({
        source_id: source.id,
        url: item.link,
        title: item.title,
        content: scraped.markdown,
        excerpt: item.description?.replace(/<[^>]*>/g, '').slice(0, 300) || null,
        image_url: item.imageUrl,
        published_at: publishedAt,
        language: source.language,
        original_language: source.language,
        is_processed: false,
      });

      if (insertErr) {
        log(`  ${RED}✗${RESET} ${item.title.slice(0, 50)}... (${insertErr.message})`);
      } else {
        log(`  ${GREEN}✓${RESET} ${item.title.slice(0, 50)}... (${scraped.markdown.length} chars)`);
        inserted++;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    if (inserted > 0) {
      log(`  ${GREEN}▸${RESET} ${source.name}: ${inserted} new articles`);
    }
    totalInserted += inserted;
  }

  log(`${GREEN}▸${RESET} Ingest complete: ${totalInserted} articles inserted`);
  return totalInserted;
}

// ===========================================================================
// STEP 2: ENRICH
// ===========================================================================

interface AnalysisResult {
  summary: string;
  topics: string[];
  bias_score: number;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  bias_indicators: string[];
  is_original_reporting: boolean;
}

function buildAnalysisPrompt(title: string, content: string): string {
  return `Analyze this Sri Lankan news article for media bias and content.

Title: ${title}

Content:
${content.slice(0, 4000)}

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "summary": "2-sentence summary of the article",
  "topics": ["topic1", "topic2", "topic3"],
  "bias_score": 0.0,
  "sentiment": "neutral",
  "bias_indicators": ["indicator1"],
  "is_original_reporting": true
}

Rules:
- bias_score: -1.0 (far left/opposition) to 1.0 (far right/government). 0.0 = neutral.
- sentiment: one of "positive", "negative", "neutral", "mixed"
- topics: 2-5 relevant topic keywords
- bias_indicators: specific phrases or framing choices that indicate bias (empty array if neutral)
- is_original_reporting: true if this appears to be original journalism, false if aggregated/wire service`;
}

function parseAnalysisResponse(responseText: string): AnalysisResult | null {
  if (!responseText) return null;

  // Strip thinking tags from qwen3 if present
  let cleaned = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Strip markdown code fences
  cleaned = cleaned.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as AnalysisResult;
  } catch {
    return null;
  }
}

async function analyzeWithOpenRouter(title: string, content: string): Promise<AnalysisResult | null> {
  const prompt = buildAnalysisPrompt(title, content);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: openrouterModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) return null;
    return parseAnalysisResponse(data.choices?.[0]?.message?.content?.trim() || '');
  } catch {
    return null;
  }
}

async function analyzeWithOllama(title: string, content: string): Promise<AnalysisResult | null> {
  const prompt = `/no_think\n${buildAnalysisPrompt(title, content)}`;

  try {
    const controller = new AbortController();
    // Ollama is slower — give it 120s
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${ollamaUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaLlmModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) return null;
    return parseAnalysisResponse(data.choices?.[0]?.message?.content?.trim() || '');
  } catch {
    return null;
  }
}

async function analyzeArticle(title: string, content: string): Promise<AnalysisResult | null> {
  if (llmProvider === 'ollama') {
    return analyzeWithOllama(title, content);
  }
  return analyzeWithOpenRouter(title, content);
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${ollamaUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: embeddingModel,
        input: text.slice(0, 8000),
        dimensions: embeddingDims,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = data.data?.[0]?.embedding;
    return embedding && embedding.length === embeddingDims ? embedding : null;
  } catch {
    return null;
  }
}

async function runEnrich(limit: number): Promise<number> {
  const llmLabel = llmProvider === 'ollama' ? `${ollamaLlmModel} via Ollama` : `${openrouterModel} via OpenRouter`;
  log(`${BOLD}ENRICH${RESET} — LLM: ${llmLabel}, Embedding: ${embeddingModel}`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, source_id')
    .is('ai_enriched_at', null)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !articles || articles.length === 0) {
    log(`${YELLOW}–${RESET} No unenriched articles found`);
    return 0;
  }

  log(`Found ${articles.length} unenriched articles`);
  let enriched = 0;

  for (const article of articles) {
    log(`${DIM}Processing: ${article.title.slice(0, 55)}...${RESET}`);

    // LLM analysis
    const analysis = await analyzeArticle(article.title, article.content!);
    if (!analysis) {
      log(`  ${RED}✗${RESET} LLM analysis failed`);
      continue;
    }

    log(`  ${GREEN}✓${RESET} Bias: ${analysis.bias_score}, Sentiment: ${analysis.sentiment}`);

    await new Promise(r => setTimeout(r, 1000));

    // Embedding
    const embeddingInput = `${article.title}\n\n${article.content!.slice(0, 6000)}`;
    const embedding = await generateEmbedding(embeddingInput);

    if (!embedding) {
      log(`  ${RED}✗${RESET} Embedding failed`);
      continue;
    }

    // Update DB
    const { error: updateErr } = await supabase
      .from('articles')
      .update({
        summary: analysis.summary,
        topics: analysis.topics,
        ai_bias_score: analysis.bias_score,
        ai_sentiment: analysis.sentiment,
        ai_enriched_at: new Date().toISOString(),
        is_processed: true,
        embedding: `[${embedding.join(',')}]`,
      })
      .eq('id', article.id);

    if (updateErr) {
      log(`  ${RED}✗${RESET} DB update failed: ${updateErr.message}`);
    } else {
      log(`  ${GREEN}✓${RESET} Enriched & saved`);
      enriched++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  log(`${GREEN}▸${RESET} Enrich complete: ${enriched}/${articles.length} articles enriched`);
  return enriched;
}

// ===========================================================================
// STEP 3: CLUSTER
// ===========================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rx = this.find(x), ry = this.find(y);
    if (rx === ry) return;
    const rX = this.rank.get(rx)!, rY = this.rank.get(ry)!;
    if (rX < rY) this.parent.set(rx, ry);
    else if (rX > rY) this.parent.set(ry, rx);
    else { this.parent.set(ry, rx); this.rank.set(rx, rX + 1); }
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

async function runCluster(threshold: number): Promise<number> {
  log(`${BOLD}CLUSTER${RESET} — grouping articles into stories (threshold: ${threshold})`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, source_id, published_at, embedding')
    .not('embedding', 'is', null)
    .is('story_id', null)
    .order('published_at', { ascending: false });

  if (error || !articles || articles.length < 2) {
    log(`${YELLOW}–${RESET} Not enough unclustered articles (${articles?.length || 0})`);
    return 0;
  }

  log(`Found ${articles.length} unclustered articles with embeddings`);

  // Parse embeddings
  const parsed: Array<{ id: string; title: string; source_id: string; embedding: number[] }> = [];
  for (const a of articles) {
    try {
      const vec = typeof a.embedding === 'string' ? JSON.parse(a.embedding) : a.embedding;
      if (Array.isArray(vec)) parsed.push({ id: a.id, title: a.title, source_id: a.source_id, embedding: vec });
    } catch {}
  }

  // Pairwise similarity + union-find
  const uf = new UnionFind();
  let pairCount = 0;

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      if (cosineSimilarity(parsed[i].embedding, parsed[j].embedding) >= threshold) {
        uf.union(parsed[i].id, parsed[j].id);
        pairCount++;
      }
    }
  }

  log(`Found ${pairCount} similar pairs`);

  // Get clusters with 2+ articles
  const storyClusters = [...uf.getClusters().entries()].filter(([, m]) => m.length >= 2);

  if (storyClusters.length === 0) {
    log(`${YELLOW}–${RESET} No new clusters found`);
    return 0;
  }

  // Get source info for bias distribution
  const { data: sources } = await supabase.from('sources').select('id, name, bias_score');
  const sourceMap = new Map((sources || []).map(s => [s.id, s]));

  let storiesCreated = 0;

  for (const [, memberIds] of storyClusters) {
    const clusterArticles = memberIds.map(id => parsed.find(p => p.id === id)!);
    const seedArticle = clusterArticles[0];
    const clusterSources = [...new Set(clusterArticles.map(a => a.source_id))];

    let left = 0, center = 0, right = 0;
    for (const sid of clusterSources) {
      const bias = sourceMap.get(sid)?.bias_score || 0;
      if (bias < -0.3) left++;
      else if (bias > 0.3) right++;
      else center++;
    }

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
      log(`  ${RED}✗${RESET} Failed to create story: ${storyErr?.message}`);
      continue;
    }

    for (const articleId of memberIds) {
      await supabase.from('articles').update({ story_id: story.id }).eq('id', articleId);
      await supabase.from('story_articles').insert({
        story_id: story.id,
        article_id: articleId,
        is_seed_article: articleId === seedArticle.id,
      });
    }

    const sourceNames = clusterSources.map(id => sourceMap.get(id)?.name || '?').join(', ');
    log(`  ${GREEN}✓${RESET} "${seedArticle.title.slice(0, 50)}..." (${memberIds.length} articles from ${sourceNames})`);
    storiesCreated++;
  }

  log(`${GREEN}▸${RESET} Cluster complete: ${storiesCreated} stories created`);
  return storiesCreated;
}

// ===========================================================================
// STEP 4: GRAPH (Graphiti knowledge graph)
// ===========================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

async function extractEntitiesFromContent(
  articleId: string,
  title: string,
  content: string,
): Promise<void> {
  try {
    // Use article content directly — no dependency on Graphiti search
    const textForExtraction = `Title: ${title}\n\n${content}`.slice(0, 4000);

    const entityPrompt = `/no_think\nExtract named entities from this news article. Return a JSON array.

Article:
${textForExtraction}

Example output:
[{"name": "Colombo", "type": "location"}, {"name": "Ranil Wickremesinghe", "type": "person"}, {"name": "Central Bank of Sri Lanka", "type": "organization"}, {"name": "inflation", "type": "topic"}]

Rules:
- "name" is the actual proper noun from the article (e.g. "Colombo", NOT "location")
- "type" is one of: person, organization, location, topic
- Maximum 10 entities
- Respond with ONLY a JSON array, no other text`;

    const llmController = new AbortController();
    const llmTimeout = setTimeout(() => llmController.abort(), 120000);

    const llmRes = await fetch(`${ollamaUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaLlmModel,
        messages: [{ role: 'user', content: entityPrompt }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: llmController.signal,
    });
    clearTimeout(llmTimeout);

    if (!llmRes.ok) return;

    const llmData = await llmRes.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    let responseText = llmData.choices?.[0]?.message?.content?.trim() || '';
    responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    responseText = responseText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();

    let entities: Array<{ name: string; type: string }>;
    try {
      const parsed = JSON.parse(responseText);
      entities = Array.isArray(parsed) ? parsed : (parsed.entities || []);
    } catch {
      return;
    }

    const validTypes = new Set(['person', 'organization', 'location', 'topic']);
    let saved = 0;

    for (const entity of entities) {
      if (!entity.name || !validTypes.has(entity.type)) continue;
      // Skip if the LLM output a type name as the entity name (hallucination guard)
      if (validTypes.has(entity.name.toLowerCase())) continue;

      const slug = slugify(entity.name);
      if (!slug) continue;

      // Upsert tag
      const { data: tag, error: tagErr } = await supabase
        .from('tags')
        .upsert(
          { name: entity.name, slug, type: entity.type, is_active: true },
          { onConflict: 'slug' }
        )
        .select('id')
        .single();

      if (tagErr || !tag) continue;

      // Link to article
      await supabase
        .from('article_tags')
        .upsert(
          { article_id: articleId, tag_id: tag.id, confidence: 0.8, source: 'ai' },
          { onConflict: 'article_id,tag_id' }
        );
      saved++;
    }

    if (saved > 0) {
      log(`    ${GREEN}✓${RESET} Extracted ${saved} entities`);
    }
  } catch {
    // Entity extraction is best-effort — don't fail the sync
  }
}

async function runGraph(limit: number): Promise<number> {
  log(`${BOLD}GRAPH${RESET} — syncing enriched articles to Graphiti knowledge graph`);

  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, summary, content, source_id, published_at')
    .not('ai_enriched_at', 'is', null)
    .is('graphiti_synced_at', null)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !articles || articles.length === 0) {
    log(`${YELLOW}–${RESET} No articles pending Graphiti sync`);
    return 0;
  }

  // Get source names for descriptions
  const sourceIds = [...new Set(articles.map(a => a.source_id))];
  const { data: sources } = await supabase
    .from('sources')
    .select('id, name')
    .in('id', sourceIds);
  const sourceMap = new Map((sources || []).map(s => [s.id, s.name]));

  log(`Found ${articles.length} articles to sync`);
  let synced = 0;

  for (const article of articles) {
    log(`${DIM}Graphiti: ${article.title.slice(0, 55)}...${RESET}`);

    const episodeContent = [
      article.summary || '',
      '',
      (article.content || '').slice(0, 4000),
    ].join('\n').trim();

    const sourceName = sourceMap.get(article.source_id) || 'Unknown';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(`${graphitiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: article.source_id,
          messages: [{
            uuid: article.id,
            name: article.title,
            role: 'user',
            role_type: 'user',
            content: episodeContent,
            source_description: `News article from ${sourceName}`,
            timestamp: article.published_at || new Date().toISOString(),
          }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        log(`  ${RED}✗${RESET} Graphiti API error ${res.status}: ${errBody.slice(0, 100)}`);
        continue;
      }

      log(`  ${GREEN}✓${RESET} Synced to knowledge graph`);

      // Extract entities from article content via LLM and create local tags
      await extractEntitiesFromContent(article.id, article.title, article.content || '');

      // Mark as synced
      const { error: updateErr } = await supabase
        .from('articles')
        .update({ graphiti_synced_at: new Date().toISOString() })
        .eq('id', article.id);

      if (updateErr) {
        log(`  ${RED}✗${RESET} DB update failed: ${updateErr.message}`);
      } else {
        synced++;
      }
    } catch (err) {
      log(`  ${RED}✗${RESET} ${err instanceof Error ? err.message : err}`);
    }

    // Graphiti does heavy LLM processing per episode — pace requests
    await new Promise(r => setTimeout(r, 2000));
  }

  log(`${GREEN}▸${RESET} Graph sync complete: ${synced}/${articles.length} articles synced`);
  return synced;
}

// ===========================================================================
// FULL PIPELINE
// ===========================================================================

async function runAll(limit: number, threshold: number) {
  log(`${BOLD}${GREEN}▸ FULL PIPELINE${RESET}`);
  console.log();

  const ingested = await runIngest(limit);
  console.log();

  if (ingested > 0) {
    await runEnrich(limit);
  } else {
    // Still try enriching — there may be unenriched articles from previous runs
    await runEnrich(limit);
  }
  console.log();

  await runGraph(limit);
  console.log();

  await runCluster(threshold);
  console.log();

  log(`${GREEN}▸ Pipeline complete${RESET}`);
}

// ===========================================================================
// DAEMON MODE
// ===========================================================================

function runDaemon(limit: number, threshold: number) {
  const INGEST_INTERVAL = 2 * 60 * 60 * 1000;  // 2 hours
  const ENRICH_INTERVAL = 3 * 60 * 60 * 1000;  // 3 hours
  const CLUSTER_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

  log(`${BOLD}${GREEN}▸ DAEMON MODE${RESET}`);
  log(`  Ingest:  every 2h`);
  log(`  Enrich:  every 3h`);
  log(`  Cluster: every 6h`);
  log(`  Press Ctrl+C to stop\n`);

  // Run full pipeline immediately on start
  runAll(limit, threshold).catch(err => log(`${RED}Pipeline error: ${err.message}${RESET}`));

  // Schedule recurring runs
  setInterval(async () => {
    try {
      log(`${DIM}--- Scheduled ingest ---${RESET}`);
      const ingested = await runIngest(limit);
      if (ingested > 0) {
        log(`${DIM}--- Auto-triggering enrich ---${RESET}`);
        await runEnrich(limit);
        log(`${DIM}--- Auto-triggering graph sync ---${RESET}`);
        await runGraph(limit);
        log(`${DIM}--- Auto-triggering cluster ---${RESET}`);
        await runCluster(threshold);
      }
    } catch (err) {
      log(`${RED}Ingest cycle error: ${err instanceof Error ? err.message : err}${RESET}`);
    }
  }, INGEST_INTERVAL);

  // Independent enrich cycle (catches any missed articles)
  setInterval(async () => {
    try {
      log(`${DIM}--- Scheduled enrich ---${RESET}`);
      await runEnrich(limit);
    } catch (err) {
      log(`${RED}Enrich cycle error: ${err instanceof Error ? err.message : err}${RESET}`);
    }
  }, ENRICH_INTERVAL);

  // Independent cluster cycle
  setInterval(async () => {
    try {
      log(`${DIM}--- Scheduled cluster ---${RESET}`);
      await runCluster(threshold);
    } catch (err) {
      log(`${RED}Cluster cycle error: ${err instanceof Error ? err.message : err}${RESET}`);
    }
  }, CLUSTER_INTERVAL);
}

// ===========================================================================
// CLI
// ===========================================================================

async function main() {
  const args = process.argv.slice(2);
  let limit = 20;
  let threshold = 0.80;
  let mode: 'ingest' | 'enrich' | 'graph' | 'cluster' | 'all' | 'daemon' | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ingest') mode = 'ingest';
    if (args[i] === '--enrich') mode = 'enrich';
    if (args[i] === '--graph') mode = 'graph';
    if (args[i] === '--cluster') mode = 'cluster';
    if (args[i] === '--all') mode = 'all';
    if (args[i] === '--daemon') mode = 'daemon';
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--threshold' && args[i + 1]) threshold = parseFloat(args[++i]);
    if (args[i] === '--llm' && args[i + 1]) {
      const val = args[++i].toLowerCase();
      if (val === 'ollama' || val === 'openrouter') llmProvider = val;
    }
  }

  if (!mode) {
    console.log(`
${GREEN}▸${RESET} News Pipeline Orchestrator

${BOLD}Usage:${RESET}
  npx tsx scripts/pipeline.ts --ingest             Ingest from all active RSS sources
  npx tsx scripts/pipeline.ts --enrich             Enrich unenriched articles (LLM + embeddings)
  npx tsx scripts/pipeline.ts --graph              Sync enriched articles to Graphiti knowledge graph
  npx tsx scripts/pipeline.ts --cluster            Cluster articles into stories
  npx tsx scripts/pipeline.ts --all                Run full pipeline (ingest → enrich → graph → cluster)
  npx tsx scripts/pipeline.ts --daemon             Run on schedule (2h/3h/6h intervals)

${BOLD}Options:${RESET}
  --limit N        Max articles per source/batch (default: 20)
  --threshold N    Cosine similarity threshold (default: 0.80)
  --llm ollama     Use Ollama (${ollamaLlmModel}) for LLM analysis
  --llm openrouter Use OpenRouter (${openrouterModel}) — default
`);
    return;
  }

  console.log();

  switch (mode) {
    case 'ingest':
      await runIngest(limit);
      break;
    case 'enrich':
      await runEnrich(limit);
      break;
    case 'graph':
      await runGraph(limit);
      break;
    case 'cluster':
      await runCluster(threshold);
      break;
    case 'all':
      await runAll(limit, threshold);
      break;
    case 'daemon':
      runDaemon(limit, threshold);
      return; // Don't exit — daemon runs forever
  }
}

main().catch((err) => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
