#!/usr/bin/env npx tsx

// Ground News Sri Lanka — Service Health Check
//
// Usage:
//   npx tsx scripts/health-check.ts [flags]
//
// Flags:
//   --all           Check all services (default if no flags)
//   --meilisearch   Check Meilisearch search engine
//   --redis         Check Redis cache/queue
//   --firecrawl     Check Firecrawl scraping API
//   --supabase      Check Supabase database
//   --embedding     Check embedding provider (Ollama, LM Studio, or OpenAI)
//   --llm           Check LLM provider (OpenRouter)
//   --neo4j         Check Neo4j graph database
//   --graphiti      Check Graphiti knowledge graph API
//   --app           Check Next.js dev server

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { createLogger } from '../lib/logger';
import { getAIConfig } from '../lib/ai-config';

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), 'env.local');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    // Don't override existing env vars
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const log = createLogger('health');

// ---------------------------------------------------------------------------
// ANSI helpers (for result icons outside the logger)
// ---------------------------------------------------------------------------

const isTTY = process.stdout.isTTY === true && !process.env.NO_COLOR;
const GREEN = isTTY ? '\x1b[32m' : '';
const RED = isTTY ? '\x1b[31m' : '';
const YELLOW = isTTY ? '\x1b[33m' : '';
const DIM = isTTY ? '\x1b[2m' : '';
const RESET = isTTY ? '\x1b[0m' : '';

// ---------------------------------------------------------------------------
// Utility: timed fetch with timeout
// ---------------------------------------------------------------------------

async function timedFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Individual service checks
// ---------------------------------------------------------------------------

async function checkMeilisearch(): Promise<CheckResult> {
  const name = 'Meilisearch';
  const start = Date.now();
  const url = process.env.MEILISEARCH_URL || 'http://localhost:7700';

  try {
    const res = await timedFetch(`${url}/health`);
    const body = (await res.json()) as { status?: string };
    const ms = Date.now() - start;

    if (body.status === 'available') {
      return { name, status: 'pass', message: `Healthy at ${url}`, durationMs: ms };
    }
    return { name, status: 'fail', message: `Unexpected status: ${JSON.stringify(body)}`, durationMs: ms };
  } catch (err) {
    return { name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const name = 'Redis';
  const start = Date.now();
  const host = 'localhost';
  const port = 6379;

  return new Promise<CheckResult>((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ name, status: 'fail', message: 'Connection timed out', durationMs: Date.now() - start });
    }, 5000);

    const socket = net.createConnection({ host, port }, () => {
      socket.write('PING\r\n');
    });

    socket.on('data', (data) => {
      clearTimeout(timer);
      const response = data.toString().trim();
      socket.destroy();

      if (response.includes('PONG')) {
        resolve({ name, status: 'pass', message: `PONG from ${host}:${port}`, durationMs: Date.now() - start });
      } else {
        resolve({ name, status: 'fail', message: `Unexpected response: ${response}`, durationMs: Date.now() - start });
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start });
    });
  });
}

async function checkFirecrawl(): Promise<CheckResult> {
  const name = 'Firecrawl';
  const start = Date.now();
  const url = process.env.FIRECRAWL_API_URL || 'http://localhost:3002';

  try {
    const res = await timedFetch(url);
    const ms = Date.now() - start;
    // Any HTTP response means the service is up
    return { name, status: 'pass', message: `Responding at ${url} (HTTP ${res.status})`, durationMs: ms };
  } catch (err) {
    return { name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  const name = 'Supabase';
  const start = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project')) {
    return { name, status: 'skip', message: 'Supabase URL/key not configured', durationMs: 0 };
  }

  try {
    // Dynamic import to avoid issues when supabase is not configured
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('sources').select('id').limit(1);
    const ms = Date.now() - start;

    if (error) {
      return { name, status: 'fail', message: `Query error: ${error.message}`, durationMs: ms };
    }
    return { name, status: 'pass', message: `Connected to ${supabaseUrl}`, durationMs: ms };
  } catch (err) {
    return { name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start };
  }
}

async function checkEmbedding(): Promise<CheckResult> {
  const name = 'Embedding';
  const start = Date.now();
  const config = getAIConfig();
  const { embedding } = config;

  if (embedding.provider === 'openai' && (!embedding.apiKey || embedding.apiKey.includes('your'))) {
    return { name, status: 'skip', message: 'OpenAI API key not configured', durationMs: 0 };
  }

  const modelsUrl = `${embedding.baseUrl}/models`;
  const headers: Record<string, string> = {};
  if (embedding.apiKey) {
    headers['Authorization'] = `Bearer ${embedding.apiKey}`;
  }

  try {
    const res = await timedFetch(modelsUrl, { headers });
    const ms = Date.now() - start;

    if (res.ok) {
      return {
        name,
        status: 'pass',
        message: `${embedding.provider} responding (model: ${embedding.model}, ${embedding.dimensions}d)`,
        durationMs: ms,
      };
    }
    return { name, status: 'fail', message: `HTTP ${res.status} from ${modelsUrl}`, durationMs: ms };
  } catch (err) {
    return { name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start };
  }
}

async function checkLLM(): Promise<CheckResult> {
  const name = 'LLM';
  const start = Date.now();
  const config = getAIConfig();
  const { llm } = config;

  if (llm.provider === 'openrouter' && (!llm.apiKey || llm.apiKey.includes('your'))) {
    return { name, status: 'skip', message: 'OpenRouter API key not configured', durationMs: 0 };
  }

  const modelsUrl = `${llm.baseUrl}/models`;
  const headers: Record<string, string> = {};
  if (llm.apiKey) {
    headers['Authorization'] = `Bearer ${llm.apiKey}`;
  }

  try {
    const res = await timedFetch(modelsUrl, { headers });
    const ms = Date.now() - start;

    if (res.ok) {
      return { name, status: 'pass', message: `${llm.provider} responding (model: ${llm.model})`, durationMs: ms };
    }
    return { name, status: 'fail', message: `HTTP ${res.status} from ${modelsUrl}`, durationMs: ms };
  } catch (err) {
    return { name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start };
  }
}

async function checkGraphiti(): Promise<CheckResult> {
  const name = 'Graphiti';
  const start = Date.now();
  const url = process.env.GRAPHITI_API_URL || 'http://localhost:8000';

  try {
    const res = await timedFetch(`${url}/healthcheck`);
    const ms = Date.now() - start;

    if (res.ok) {
      return { name, status: 'pass', message: `Healthy at ${url}`, durationMs: ms };
    }
    return { name, status: 'fail', message: `HTTP ${res.status} from ${url}/healthcheck`, durationMs: ms };
  } catch (err) {
    return { name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start };
  }
}

async function checkNeo4j(): Promise<CheckResult> {
  const name = 'Neo4j';
  const start = Date.now();
  const host = 'localhost';
  const port = 7687;

  return new Promise<CheckResult>((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ name, status: 'fail', message: 'Connection timed out', durationMs: Date.now() - start });
    }, 5000);

    const socket = net.createConnection({ host, port }, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ name, status: 'pass', message: `Bolt protocol at ${host}:${port}`, durationMs: Date.now() - start });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ name, status: 'fail', message: errorMessage(err), durationMs: Date.now() - start });
    });
  });
}

async function checkApp(): Promise<CheckResult> {
  const name = 'Next.js App';
  const start = Date.now();
  const url = 'http://localhost:3001';

  try {
    const res = await timedFetch(url);
    const ms = Date.now() - start;
    return { name, status: 'pass', message: `Running at ${url} (HTTP ${res.status})`, durationMs: ms };
  } catch (err) {
    const msg = errorMessage(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return { name, status: 'skip', message: 'Dev server not running', durationMs: Date.now() - start };
    }
    return { name, status: 'fail', message: msg, durationMs: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Node.js system errors (socket, DNS) have a code property
    const errWithCode = err as Error & { code?: string };
    if (errWithCode.code) return errWithCode.code;

    // Node.js fetch errors put useful info in cause.code (e.g. ECONNREFUSED)
    const cause = err.cause as (Error & { code?: string }) | undefined;
    if (cause?.code) return cause.code;
    if (cause?.message) return cause.message;

    return err.message;
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// Service registry
// ---------------------------------------------------------------------------

const SERVICE_CHECKS: Record<string, () => Promise<CheckResult>> = {
  meilisearch: checkMeilisearch,
  redis: checkRedis,
  firecrawl: checkFirecrawl,
  supabase: checkSupabase,
  embedding: checkEmbedding,
  llm: checkLLM,
  neo4j: checkNeo4j,
  graphiti: checkGraphiti,
  app: checkApp,
};

const SERVICE_ORDER = ['meilisearch', 'redis', 'firecrawl', 'supabase', 'embedding', 'llm', 'neo4j', 'graphiti', 'app'];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): Set<string> {
  const args = process.argv.slice(2).map((a) => a.replace(/^--/, ''));

  if (args.length === 0 || args.includes('all')) {
    return new Set(SERVICE_ORDER);
  }

  const valid = new Set(Object.keys(SERVICE_CHECKS));
  const requested = new Set<string>();

  for (const arg of args) {
    if (valid.has(arg)) {
      requested.add(arg);
    } else {
      log.warn(`Unknown service: ${arg}`, { valid: SERVICE_ORDER.join(', ') });
    }
  }

  return requested;
}

// ---------------------------------------------------------------------------
// Result printer
// ---------------------------------------------------------------------------

function printResult(result: CheckResult): void {
  const icon =
    result.status === 'pass'
      ? `${GREEN}✓${RESET}`
      : result.status === 'fail'
        ? `${RED}✗${RESET}`
        : `${YELLOW}–${RESET}`;

  const duration = `${DIM}${result.durationMs}ms${RESET}`;
  const padded = result.name.padEnd(14);

  process.stdout.write(`  ${icon} ${padded} ${result.message} ${duration}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnv();

  const requested = parseArgs();
  if (requested.size === 0) {
    log.error('No valid services specified');
    process.exit(1);
  }

  const config = getAIConfig();
  log.info('Ground News Sri Lanka — Health Check', { env: config.env });
  process.stdout.write('\n');

  const results: CheckResult[] = [];

  for (const name of SERVICE_ORDER) {
    if (!requested.has(name)) continue;

    const checkFn = SERVICE_CHECKS[name];
    const result = await checkFn();
    results.push(result);
    printResult(result);
  }

  // Summary
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  process.stdout.write('\n');

  if (failed > 0) {
    log.error('Health check completed', { passed, failed, skipped, total: results.length });
    process.exit(1);
  }

  log.info('All services healthy', { passed, skipped, total: results.length });
}

main().catch((err) => {
  log.error('Unexpected error', { error: String(err) });
  process.exit(1);
});
