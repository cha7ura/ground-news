/**
 * Test enrichment pipeline: OpenRouter (bias analysis) + Ollama (embeddings)
 *
 * Usage: npx tsx scripts/test-enrich.ts [--limit 3]
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

const openrouterKey = process.env.OPENROUTER_API_KEY!;
const openrouterModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'qwen3-embedding:0.6b';
const embeddingDims = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024', 10);

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// LLM Analysis via OpenRouter
// ---------------------------------------------------------------------------

interface AnalysisResult {
  summary: string;
  topics: string[];
  bias_score: number;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  bias_indicators: string[];
  is_original_reporting: boolean;
}

async function analyzeArticle(title: string, content: string): Promise<AnalysisResult | null> {
  const truncatedContent = content.slice(0, 4000); // Keep within token limits

  const prompt = `Analyze this Sri Lankan news article for media bias and content.

Title: ${title}

Content:
${truncatedContent}

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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterKey}`,
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

    if (data.error) {
      console.error(`  ${RED}OpenRouter error: ${data.error.message}${RESET}`);
      return null;
    }

    const responseText = data.choices?.[0]?.message?.content?.trim();
    if (!responseText) {
      console.error(`  ${RED}Empty LLM response${RESET}`);
      return null;
    }

    // Parse JSON, stripping markdown code fences if present
    const jsonStr = responseText.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
    try {
      return JSON.parse(jsonStr) as AnalysisResult;
    } catch (parseErr) {
      console.error(`  ${RED}JSON parse error. Raw response:${RESET}`);
      console.error(`  ${DIM}${responseText.slice(0, 300)}${RESET}`);
      return null;
    }
  } catch (err) {
    console.error(`  ${RED}LLM error: ${err instanceof Error ? err.message : err}${RESET}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Embedding via Ollama
// ---------------------------------------------------------------------------

async function generateEmbedding(text: string): Promise<number[] | null> {
  const truncated = text.slice(0, 8000);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(`${ollamaUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: embeddingModel,
        input: truncated,
        dimensions: embeddingDims,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as {
      data?: Array<{ embedding?: number[] }>;
      error?: { message?: string };
    };

    if (data.error) {
      console.error(`  ${RED}Ollama error: ${data.error.message}${RESET}`);
      return null;
    }

    const embedding = data.data?.[0]?.embedding;
    if (!embedding || embedding.length !== embeddingDims) {
      console.error(`  ${RED}Unexpected embedding dims: ${embedding?.length}${RESET}`);
      return null;
    }

    return embedding;
  } catch (err) {
    console.error(`  ${RED}Embedding error: ${err instanceof Error ? err.message : err}${RESET}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let limit = 3;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
  }

  console.log(`\n${GREEN}▸${RESET} Test Enrichment Pipeline`);
  console.log(`  LLM: ${openrouterModel} via OpenRouter`);
  console.log(`  Embedding: ${embeddingModel} via Ollama (${embeddingDims}d)\n`);

  // 1. Get unenriched articles
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, content, source_id')
    .is('ai_enriched_at', null)
    .not('content', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !articles || articles.length === 0) {
    console.log(`${YELLOW}–${RESET} No unenriched articles found`);
    process.exit(0);
  }

  console.log(`Found ${articles.length} unenriched articles\n`);

  let enriched = 0;
  let failed = 0;

  for (const article of articles) {
    console.log(`${DIM}Processing: ${article.title.slice(0, 60)}...${RESET}`);

    // Step 1: LLM analysis
    console.log(`  ${DIM}→ Analyzing with ${openrouterModel}...${RESET}`);
    const analysis = await analyzeArticle(article.title, article.content!);

    if (!analysis) {
      console.log(`  ${RED}✗ LLM analysis failed${RESET}`);
      failed++;
      continue;
    }

    console.log(`  ${GREEN}✓${RESET} Bias: ${analysis.bias_score}, Sentiment: ${analysis.sentiment}`);
    console.log(`    Topics: ${analysis.topics.join(', ')}`);
    console.log(`    Summary: ${analysis.summary.slice(0, 100)}...`);

    // Rate limit between LLM and embedding
    await new Promise(r => setTimeout(r, 1000));

    // Step 2: Generate embedding
    console.log(`  ${DIM}→ Generating embedding...${RESET}`);
    const embeddingInput = `${article.title}\n\n${article.content!.slice(0, 6000)}`;
    const embedding = await generateEmbedding(embeddingInput);

    if (!embedding) {
      console.log(`  ${RED}✗ Embedding generation failed${RESET}`);
      failed++;
      continue;
    }

    console.log(`  ${GREEN}✓${RESET} Embedding: ${embedding.length}d vector`);

    // Step 3: Update article in Supabase
    const vectorStr = `[${embedding.join(',')}]`;
    const { error: updateErr } = await supabase
      .from('articles')
      .update({
        summary: analysis.summary,
        topics: analysis.topics,
        ai_bias_score: analysis.bias_score,
        ai_sentiment: analysis.sentiment,
        ai_enriched_at: new Date().toISOString(),
        is_processed: true,
        embedding: vectorStr,
      })
      .eq('id', article.id);

    if (updateErr) {
      console.log(`  ${RED}✗ DB update failed: ${updateErr.message}${RESET}`);
      failed++;
    } else {
      console.log(`  ${GREEN}✓${RESET} Saved to database\n`);
      enriched++;
    }

    // Rate limit between articles
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log(`${GREEN}▸${RESET} Results: ${enriched} enriched, ${failed} failed`);

  // Verify
  const { count } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .not('ai_enriched_at', 'is', null);

  console.log(`  Total enriched articles in database: ${count || 0}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
