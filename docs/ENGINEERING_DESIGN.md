# Ground News Sri Lanka - Engineering Design Document

## 1. Overview

Ground News Sri Lanka is a news aggregation and media bias analysis platform for Sri Lankan journalism. It ingests articles from multiple news sources, analyzes them for political bias using AI, generates vector embeddings for semantic similarity, and clusters related articles into stories to reveal how different outlets cover the same events.

### Goals

- Aggregate news from Sri Lankan outlets (English and Sinhala)
- Detect and visualize media bias across the political spectrum
- Cluster related articles into unified stories using vector similarity
- Identify media blindspots (stories only covered by one side)
- Provide daily briefings with coverage statistics

---

## 2. Architecture

```
                    +-----------------+
                    |   Next.js App   |
                    |   (Frontend)    |
                    |   Port 3001     |
                    +--------+--------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+  +----v--------+
     |  Supabase  |  | Meilisearch |  |  n8n        |
     | (Postgres  |  | (Search)    |  | (Workflows) |
     |  + pgvector)|  | Port 7700   |  |             |
     +--------+---+  +-------------+  +----+--------+
              |                             |
              |              +--------------+--------------+
              |              |              |              |
              |     +--------v---+  +------v------+  +----v--------+
              |     | OpenRouter |  | Embedding   |  | Firecrawl   |
              |     | (LLM)     |  | Provider    |  | (Scraping)  |
              |     +------------+  +-------------+  | Port 3002   |
              |                     | OpenAI (prod) | +-------------+
              |                     | Ollama/Docker |
              |                     | (local)       |
              |                     +---------------+
              |
     +--------v-------------------+
     | Redis (Firecrawl queue)    |
     | Port 6379                  |
     +----------------------------+
```

### Component Summary

| Component        | Technology                 | Purpose                                     |
| ---------------- | -------------------------- | ------------------------------------------- |
| Frontend         | Next.js 14, React 18       | Server-rendered UI with i18n (en/si)        |
| Database         | Supabase (PostgreSQL)      | Data storage, pgvector for embeddings (local or cloud) |
| Search           | Meilisearch v1.12          | Full-text article and story search          |
| Orchestration    | n8n                        | Scheduled workflows for ingestion/enrichment|
| LLM Analysis     | OpenRouter (GPT-4o-mini)   | Bias scoring, topic extraction, summaries   |
| Embeddings       | OpenAI / Ollama / LM Studio| Vector embeddings for article clustering    |
| Web Scraping     | Firecrawl + Playwright     | Full article content extraction             |
| Caching/Queue    | Redis 7                    | Firecrawl job queue                         |

---

## 3. Data Model

### Entity Relationship

```
sources 1──* articles *──1 stories
                |                |
                |                |
           article_tags     story_tags
                |                |
                +───* tags *─────+

stories *──* briefing_stories *──1 daily_briefings
```

### Core Tables

#### `sources`
News outlets with editorial metadata.

| Column            | Type         | Description                                         |
| ----------------- | ------------ | --------------------------------------------------- |
| id                | UUID (PK)    | Unique identifier                                   |
| name              | TEXT         | Display name                                        |
| slug              | TEXT (UNIQUE)| URL-safe identifier                                 |
| url               | TEXT         | Source homepage                                     |
| bias_score        | FLOAT        | Editorial bias: -1.0 (far left) to 1.0 (far right) |
| factuality_score  | INT          | Factual reliability: 0-100                          |
| rss_url           | TEXT         | RSS feed URL for ingestion                          |
| language          | TEXT         | Primary language (en/si)                            |
| languages         | TEXT[]       | All supported languages                             |
| is_active         | BOOLEAN      | Whether source is being scraped                     |

#### `articles`
Individual news articles with AI enrichment data.

| Column              | Type          | Description                                    |
| ------------------- | ------------- | ---------------------------------------------- |
| id                  | UUID (PK)     | Unique identifier                              |
| source_id           | UUID (FK)     | Reference to source                            |
| url                 | TEXT (UNIQUE) | Article URL (dedup key)                        |
| title               | TEXT          | Headline                                       |
| content             | TEXT          | Full article text (markdown)                   |
| summary             | TEXT          | AI-generated 2-sentence summary                |
| embedding           | vector(1536)  | Vector embedding (production: OpenAI ada-002)  |
| ai_bias_score       | FLOAT         | Per-article bias: -1.0 to 1.0                  |
| ai_sentiment        | TEXT          | positive / negative / neutral / mixed          |
| topics              | TEXT[]        | AI-extracted topic keywords                    |
| is_original_reporting | BOOLEAN     | Original vs aggregated content                 |
| language            | TEXT          | Article language                               |
| title_si / title_en | TEXT          | Bilingual title translations                   |
| story_id            | UUID (FK)     | Cluster assignment                             |

#### `stories`
Clustered article groups representing a single news event.

| Column              | Type   | Description                                      |
| ------------------- | ------ | ------------------------------------------------ |
| id                  | UUID   | Unique identifier                                |
| title               | TEXT   | Representative headline (from seed article)      |
| bias_distribution   | JSONB  | `{"left": N, "center": N, "right": N}`           |
| article_count       | INT    | Number of articles in cluster                    |
| source_count        | INT    | Number of distinct sources                       |
| blindspot_type      | TEXT   | left / right / both / none                       |
| is_blindspot        | BOOLEAN| Whether a political perspective is missing       |
| blindspot_severity  | INT    | 0-100 severity score                             |
| is_briefing_pick    | BOOLEAN| Selected for daily briefing                      |

#### `tags`
Entity tags for articles (persons, organizations, locations, topics, events).

| Column       | Type         | Description                     |
| ------------ | ------------ | ------------------------------- |
| id           | UUID         | Unique identifier               |
| name         | TEXT         | English name                    |
| name_si      | TEXT         | Sinhala name                    |
| slug         | TEXT (UNIQUE)| URL-safe identifier             |
| type         | TEXT         | person/organization/location/topic/event/custom |
| article_count| INT          | Auto-updated via trigger        |

### Database Functions

| Function                    | Trigger | Purpose                                          |
| --------------------------- | ------- | ------------------------------------------------ |
| `find_similar_articles()`   | RPC     | Vector similarity search with threshold           |
| `get_unclustered_articles()`| RPC     | Fetch articles pending clustering (last 48h)      |
| `update_story_stats()`      | RPC     | Recalculate article/source counts, bias dist      |
| `detect_story_blindspot()`  | RPC     | Determine if a story has coverage gaps            |
| `generate_daily_briefing()` | RPC     | Auto-select top stories for daily briefing        |
| `update_source_article_count()` | INSERT/DELETE on articles | Keep source.article_count in sync |
| `update_article_reading_time()`  | INSERT/UPDATE on articles | Auto-calculate reading time     |
| `update_tag_article_count()`     | INSERT/DELETE on article_tags | Keep tag.article_count in sync |

---

## 4. Data Pipeline

Three n8n workflows run on scheduled intervals to ingest, enrich, and cluster articles.

### 4.1 Article Ingestion (every 30 minutes)

```
[Schedule] -> [Get Active Sources] -> [Split Sources] -> [Fetch RSS]
    -> [Parse RSS XML] -> [Get Existing URLs] -> [Filter Duplicates]
    -> [Scrape via Firecrawl] -> [Rate Limit 2s] -> [Prepare Data]
    -> [Insert Article] -> [Update Source Timestamp]
```

**Details:**
- Fetches active sources with RSS feeds from Supabase
- Parses RSS XML to extract title, link, pubDate, image
- Deduplicates against existing article URLs
- Scrapes full markdown content via Firecrawl (self-hosted or cloud)
- Rate-limited at 2 seconds between scrapes
- Processes up to 20 RSS items per source per run

### 4.2 Article Enrichment (every 1 hour)

```
[Schedule] -> [Get Un-enriched Articles (limit 10)]
    -> [Split] -> [Analyze via OpenRouter] -> [Rate Limit 1s]
    -> [Parse LLM Response] -> [Generate Embedding] -> [Rate Limit 500ms]
    -> [Combine Analysis + Embedding] -> [Update Article in Supabase]
```

**Details:**
- Selects articles where `ai_enriched_at IS NULL` and `content IS NOT NULL`
- LLM analysis extracts: summary, topics, bias_score, sentiment, bias_indicators, is_original_reporting
- Embedding generation uses the configured provider (see Section 5)
- All enrichment data written back in a single update

### 4.3 Story Clustering (every 2 hours)

```
[Schedule] -> [Get Unclustered Articles (48h window)]
    -> [Cosine Similarity + Union-Find Clustering]
    -> [Create Story Records] -> [Link Articles to Stories]
    -> [Update Story Stats] -> [Detect Blindspots]
```

**Details:**
- Fetches articles with embeddings but no `story_id` from last 48 hours
- Computes pairwise cosine similarity between all embedding vectors
- Groups articles exceeding **0.85 similarity threshold** using Union-Find
- Only creates stories for clusters with 2+ articles
- Calculates bias distribution from source bias scores
- Runs blindspot detection (missing left/right coverage)

### Pipeline Timing

| Workflow             | Interval   | Batch Size | Rate Limit        |
| -------------------- | ---------- | ---------- | ----------------- |
| Article Ingestion    | 30 min     | 20/source  | 2s between scrapes|
| Article Enrichment   | 1 hour     | 10         | 1s + 500ms       |
| Story Clustering     | 2 hours    | All (48h)  | N/A (in-memory)   |

---

## 5. Embedding System

The embedding system supports three providers, switched via `APP_ENV` and `EMBEDDING_PROVIDER` environment variables.

### Provider Configuration

| Setting          | Ollama (local default)                   | LM Studio (local alt)                    | Production                                 |
| ---------------- | ---------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| Provider         | Ollama (Docker)                          | LM Studio (desktop)                      | OpenAI API                                 |
| Base URL         | `http://localhost:11434/v1`              | `http://localhost:1234/v1`               | `https://api.openai.com/v1`               |
| Default Model    | `qwen3-embedding:0.6b`                  | `text-embedding-qwen3-embedding-0.6b`   | `text-embedding-ada-002`                   |
| Dimensions       | 1024 (configurable 32-1024)              | 1024 (configurable 32-1024)              | 1536 (fixed)                               |
| Max Input        | 8,192 tokens                             | 8,192 tokens                             | 8,191 tokens                               |
| API Compatibility| OpenAI-compatible                        | OpenAI-compatible                        | OpenAI native                              |
| Auth             | None required                            | Dummy key (`lm-studio`)                  | API key (Bearer token)                     |

### Why Ollama for Local/Docker Deployment

We evaluated three options for serving embedding models in containers:

| Criteria               | Ollama                          | llama.cpp server                | vLLM                              |
| ---------------------- | ------------------------------- | ------------------------------- | --------------------------------- |
| **Docker setup**       | Single official image           | Manual build or community image | Official image (heavy ~8GB)       |
| **Model management**   | Built-in (`ollama pull`)        | Manual GGUF file download       | HuggingFace integration           |
| **API compatibility**  | OpenAI-compatible `/v1`         | OpenAI-compatible `/v1`         | OpenAI-compatible `/v1`           |
| **GPU support**        | NVIDIA + Apple Silicon          | NVIDIA + Apple Silicon          | NVIDIA only (CUDA required)       |
| **Resource overhead**  | ~200MB base + model             | ~50MB base + model              | ~2GB base + model                 |
| **Embedding support**  | Native `/api/embed` + `/v1`    | `/v1/embeddings`                | `/v1/embeddings`                  |
| **Model format**       | Auto-downloads GGUF             | Requires pre-downloaded GGUF    | Uses HF safetensors               |
| **Healthcheck**        | Built-in `/api/tags`            | Manual setup                    | Built-in `/health`                |
| **Community/ecosystem**| Large (100k+ GitHub stars)      | Large (core library)            | Growing (production-focused)      |

**Decision: Ollama** was chosen because:

1. **Self-contained Docker workflow**: `docker compose up` starts everything. Ollama's built-in model registry means the model is pulled automatically via `ollama pull qwen3-embedding:0.6b` — no manual file downloads, no volume-mounting GGUF files, no extra build steps.

2. **Deployment parity**: The same Ollama container runs identically in local Docker, CI/CD, staging, and production. llama.cpp requires managing GGUF files separately from the container image. vLLM requires NVIDIA GPUs, which limits deployment targets.

3. **Sufficient for our scale**: The enrichment pipeline processes ~10 articles/hour with rate limiting. We don't need vLLM's batched inference or continuous batching optimizations — Ollama's sequential serving is more than adequate.

4. **Apple Silicon support**: Local development on macOS with M-series chips works out of the box. vLLM is CUDA-only, which rules it out for Mac-based dev.

5. **Minimal overhead**: llama.cpp is lighter (~50MB vs ~200MB), but the difference is negligible next to the model size itself. The trade-off of automatic model management is worth the extra 150MB.

**When to reconsider**: If the platform scales to processing hundreds of articles simultaneously, vLLM's continuous batching and GPU scheduling would become worthwhile. At that point, switching is straightforward since all three options expose the same OpenAI-compatible API.

### Available Local Models

All three Qwen3-Embedding sizes are available via both Ollama and LM Studio:

| Ollama Tag                | LM Studio Model Name                       | Params | Max Dims | VRAM   | Recommendation            |
| ------------------------- | ------------------------------------------ | ------ | -------- | ------ | ------------------------- |
| `qwen3-embedding:0.6b`   | `text-embedding-qwen3-embedding-0.6b`     | 0.6B   | 1024     | ~2 GB  | **Default for local dev** |
| `qwen3-embedding:4b`     | `text-embedding-qwen3-embedding-4b`       | 4B     | 2048     | ~8 GB  | Balanced quality/speed    |
| `qwen3-embedding:8b`     | `text-embedding-qwen3-embedding-8b`       | 8B     | 4096     | ~16 GB | Highest quality           |

**Why 0.6B is the default for local development:**

- **Competitive quality**: Qwen3-Embedding-0.6B scores competitively on MTEB benchmarks, ranking just behind Gemini-Embedding despite being 0.6B parameters. It performs comparably to models 10x+ its size on clustering tasks.
- **Speed**: Generates embeddings significantly faster, which matters for the hourly enrichment workflow processing articles sequentially with rate limits.
- **Resource efficiency**: Runs on a 4GB GPU or CPU with 16GB RAM, leaving headroom for other local services (Meilisearch, Redis, Firecrawl, Next.js dev server).
- **Sufficient for clustering**: The story clustering pipeline uses a 0.85 cosine similarity threshold, which is a relatively coarse grouping. The quality difference between 0.6B and 8B models is negligible at this threshold for news article clustering.

### Qwen3-Embedding Model Family

The Qwen3-Embedding series (Alibaba/Qwen) is designed specifically for text embedding and ranking tasks:

- **MTEB #1**: The 8B model ranks #1 on the MTEB multilingual leaderboard (score 70.58)
- **100+ languages**: Strong multilingual support including Sinhala, critical for this bilingual platform
- **Instruction-aware**: Supports task-specific instructions for improved downstream performance
- **Matryoshka Representation Learning (MRL)**: Flexible output dimensions (e.g., 0.6B supports 32 to 1024) allowing storage/accuracy trade-offs
- **Apache 2.0 license**: Fully open-source

### Dimension Considerations

| Environment | Dimensions | Vector Column     | Index                                        |
| ----------- | ---------- | ----------------- | -------------------------------------------- |
| Production  | 1536       | `vector(1536)`    | IVFFlat with `vector_cosine_ops`, 100 lists  |
| Local       | 1024       | Requires separate | Must match configured `EMBEDDING_DIMENSIONS` |

**Important**: Production Supabase uses `vector(1536)` columns sized for OpenAI ada-002. Local development with Qwen3 models (max 1024 dims for 0.6B) requires either:
1. A separate local Supabase instance with appropriately sized vector columns
2. Using the 4B or 8B model configured to output 1536 dimensions (within their max range)
3. Running a migration to alter the column size for local development

### Docker Setup (Ollama)

The Ollama service is defined in `docker-compose.yml` and starts with the rest of the stack:

```bash
# Start all services including Ollama
docker compose up -d

# Pull the embedding model (first time only, ~400MB for 0.6B Q4)
docker exec ground-news-ollama ollama pull qwen3-embedding:0.6b

# Or use the setup script:
./scripts/ollama-setup.sh              # default: qwen3-embedding:0.6b
./scripts/ollama-setup.sh qwen3-embedding:8b  # use a different model
```

The `OLLAMA_KEEP_ALIVE=-1` environment variable keeps the model loaded in memory permanently, avoiding cold-start latency on embedding requests.

### Configuration Files

| File                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `lib/ai-config.ts`    | TypeScript config — exports `getAIConfig()`, `getEmbeddingEndpoint()`, `getEmbeddingHeaders()` |
| `env.local`           | Local environment — `APP_ENV=local`, `EMBEDDING_PROVIDER=ollama` |
| `env.example`         | Template — documents all available env vars           |
| `n8n/SETUP.md`        | n8n-specific setup with embedding provider env vars   |

### n8n Workflow Integration

The article enrichment workflow's "Generate Embedding" HTTP node uses environment variables with OpenAI fallbacks:

```
URL:   {{ $env.EMBEDDING_API_URL   || 'https://api.openai.com/v1/embeddings' }}
Key:   {{ $env.EMBEDDING_API_KEY   || $env.OPENAI_API_KEY }}
Model: {{ $env.EMBEDDING_MODEL     || 'text-embedding-ada-002' }}
```

For local development with Ollama, set these in n8n's environment:
```
EMBEDDING_API_URL=http://localhost:11434/v1/embeddings
EMBEDDING_MODEL=qwen3-embedding:0.6b
# No API key needed for Ollama
```

For local development with LM Studio:
```
EMBEDDING_API_URL=http://localhost:1234/v1/embeddings
EMBEDDING_API_KEY=lm-studio
EMBEDDING_MODEL=text-embedding-qwen3-embedding-0.6b
```

---

## 6. Bias Analysis System

### Bias Score Scale

| Score Range    | Label     | Sri Lankan Context                          |
| -------------- | --------- | ------------------------------------------- |
| -1.0 to -0.6  | Far Left  | Strong opposition/progressive leaning       |
| -0.6 to -0.3  | Left      | Moderate opposition leaning                 |
| -0.3 to  0.3  | Center    | Balanced/neutral coverage                   |
|  0.3 to  0.6  | Right     | Moderate government leaning                 |
|  0.6 to  1.0  | Far Right | Strong government/conservative leaning      |

### Two-Level Bias Tracking

1. **Source-level bias** (`sources.bias_score`): Editorial stance of the outlet, manually assigned
2. **Article-level bias** (`articles.ai_bias_score`): Per-article AI analysis via OpenRouter/GPT-4o-mini

### Blindspot Detection

A story is flagged as a blindspot when:
- It has 3+ articles covering it (sufficient data)
- One political perspective is completely absent from coverage
- Severity is calculated as `(missing_side_count * 100) / total_articles`

---

## 7. Internationalization (i18n)

The platform supports English (`en`) and Sinhala (`si`):

- **URL routing**: `/en/...` and `/si/...` via Next.js App Router `[locale]` segment
- **Article content**: Bilingual fields (`title_si`, `title_en`, `summary_si`, `summary_en`)
- **Tag names**: `tags.name` (English) and `tags.name_si` (Sinhala)
- **UI translations**: Dictionary-based via `lib/i18n/get-dictionary.ts`
- **Source language tracking**: `sources.language` (primary) and `sources.languages[]` (all)

Helper functions in `lib/types.ts`:
- `getLocalizedTitle()` — returns the correct title for the current locale
- `getLocalizedSummary()` — returns the correct summary for the current locale
- `getLocalizedTagName()` — returns the correct tag name for the current locale

---

## 8. Search

Meilisearch v1.12 provides full-text search:

- **Index**: Articles indexed with title, content, topics
- **Initialization**: `npm run meilisearch:init` via `scripts/init-meilisearch.ts`
- **Client**: `lib/meilisearch.ts`
- **Local**: Runs in Docker on port 7700

---

## 9. Infrastructure

### Docker Services (`docker-compose.yml`)

| Service              | Image                                  | Port  | Purpose                         |
| -------------------- | -------------------------------------- | ----- | ------------------------------- |
| meilisearch          | `getmeili/meilisearch:v1.12`           | 7700  | Full-text search                |
| redis                | `redis:7-alpine`                       | 6379  | Firecrawl job queue             |
| firecrawl-playwright | `mcr.microsoft.com/playwright:v1.49.1` | 3100  | Browser automation              |
| firecrawl            | `ghcr.io/firecrawl/firecrawl:latest`   | 3002  | Web scraping API                |
| firecrawl-postgres   | `postgres:16-alpine`                   | —     | Firecrawl NUQ job queue DB      |
| firecrawl-rabbitmq   | `rabbitmq:3-alpine`                    | —     | Firecrawl message broker        |
| ollama               | `ollama/ollama:latest`                 | 11434 | Embedding model server          |
| n8n                  | `docker.n8n.io/n8nio/n8n:latest`       | 5678  | Workflow orchestration           |

**Firecrawl dependency note**: As of 2025, Firecrawl's `latest` image requires its own PostgreSQL (NUQ job queue) and RabbitMQ for internal message passing. These are internal services with no exposed ports — only Firecrawl connects to them. The Postgres instance is initialized with `docker/firecrawl-init.sql` (NUQ schema, adapted from upstream with `pg_cron` removed for Alpine compatibility).

### Supabase (Local via CLI)

Supabase runs locally via the Supabase CLI, independent of `docker-compose.yml`. It manages its own ~14 containers (PostgreSQL, PostgREST, GoTrue, Realtime, Storage, Kong, Studio, etc.).

```bash
supabase start          # Start local Supabase (~4 GB RAM)
supabase stop           # Stop all Supabase containers
supabase status         # Show URLs and keys
supabase db reset       # Reset DB and re-run migrations
supabase db diff        # Generate migration from schema changes
supabase db push        # Push migrations to remote
```

**Key endpoints:**

| Service     | Port  | URL                                |
| ----------- | ----- | ---------------------------------- |
| API (Kong)  | 54321 | `http://127.0.0.1:54321`          |
| PostgreSQL  | 54322 | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio      | 54323 | `http://127.0.0.1:54323`          |
| Email (Mailpit) | 54324 | `http://127.0.0.1:54324`      |

**pgvector is included out of the box** — just enable the extension:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Supabase is configured independently of `APP_ENV`. You can use local Supabase with production AI providers or vice versa. Just change the `NEXT_PUBLIC_SUPABASE_URL` and keys in your env file.

Configuration: `supabase/config.toml` (auth URLs set to `localhost:3001` to match Next.js dev server).

### External Services (Production)

| Service    | Usage                        | Auth                     |
| ---------- | ---------------------------- | ------------------------ |
| Supabase   | PostgreSQL + pgvector + Auth | Service key + Anon key   |
| OpenRouter | LLM bias analysis            | API key (Bearer token)   |
| OpenAI     | Embeddings (production)      | API key (Bearer token)   |

For local development:
- **Supabase** → Supabase CLI (`supabase start`)
- **OpenAI** → Ollama (Docker) or LM Studio (desktop) for embeddings
- **OpenRouter** → Used in both local and production (only external service required locally)

### Environment Variables

```bash
# Core
APP_ENV=local|production

# Supabase (independent of APP_ENV — use local or cloud in any environment)
# Local:  http://127.0.0.1:54321 + default keys from `supabase start`
# Cloud:  https://your-project.supabase.co + project keys
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Search
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_MASTER_KEY=

# AI - Production
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# AI - Local embedding provider selection
EMBEDDING_PROVIDER=ollama|lmstudio  # default: ollama
EMBEDDING_DIMENSIONS=1024

# AI - Local (Ollama, default)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b

# AI - Local (LM Studio, alternative)
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_EMBEDDING_MODEL=text-embedding-qwen3-embedding-0.6b
LMSTUDIO_LLM_MODEL=
LMSTUDIO_API_KEY=lm-studio

# Scraping
FIRECRAWL_API_URL=http://localhost:3002
FIRECRAWL_API_KEY=

# Admin
ADMIN_SECRET=
```

### Environment Files

| File              | `APP_ENV`    | Supabase         | AI Providers      |
| ----------------- | ------------ | ---------------- | ----------------- |
| `env.local`       | `local`      | Local (CLI)      | Ollama + OpenRouter|
| `env.staging`     | `production` | Cloud            | OpenAI + OpenRouter|
| `env.production`  | `production` | Cloud            | OpenAI + OpenRouter|

Supabase can be swapped in any env file by changing the URL and keys.

---

## 10. Frontend

### Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, Tailwind CSS, Lucide icons
- **Utilities**: clsx, tailwind-merge, class-variance-authority, date-fns
- **Dev server**: Port 3001

### Page Structure

```
app/[locale]/
  page.tsx                  # Home — latest stories feed
  story/[id]/page.tsx       # Story detail — multi-source comparison
  source/[slug]/page.tsx    # Source profile — articles by outlet
  sources/page.tsx          # Sources directory
  topics/page.tsx           # Topic browser
  blindspots/page.tsx       # Blindspot stories
  daily-briefing/page.tsx   # Daily briefing view
  admin/page.tsx            # Admin — tag management
```

### Key Components

| Component            | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `story-card.tsx`     | Story preview with bias distribution bar          |
| `article-card.tsx`   | Article preview with source badge                 |
| `bias-indicator.tsx` | Visual bias score indicator (-1 to +1)            |
| `blindspot-badge.tsx`| Badge showing which perspective is missing        |

---

## 11. References

### Embedding Models

- [Qwen3-Embedding-0.6B on Hugging Face](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)
- [Qwen3-Embedding-0.6B GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF)
- [Qwen3-Embedding-8B on Hugging Face](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- [Qwen3 Embedding Blog Post — Advancing Text Embedding and Reranking](https://qwenlm.github.io/blog/qwen3-embedding/)
- [Qwen3 Embedding Paper (arXiv)](https://arxiv.org/pdf/2506.05176)
- [Qwen3-Embedding GitHub Repository](https://github.com/QwenLM/Qwen3-Embedding)
- [OpenAI text-embedding-ada-002](https://platform.openai.com/docs/guides/embeddings)

### Benchmarks and Comparisons

- [MTEB Leaderboard (Modal)](https://modal.com/blog/mteb-leaderboard-article)
- [Best Open-Source Embedding Models (BentoML)](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [Best Embedding Models 2026 (Openxcell)](https://www.openxcell.com/blog/best-embedding-models/)
- [Best Embedding Models for RAG (GreenNode)](https://greennode.ai/blog/best-embedding-models-for-rag)
- [Open Source Embedding Models Benchmark (AIMultiple)](https://research.aimultiple.com/open-source-embedding-models/)

### Ollama

- [Ollama Documentation](https://ollama.com/)
- [Ollama Docker Hub](https://hub.docker.com/r/ollama/ollama)
- [Ollama GitHub Repository](https://github.com/ollama/ollama)
- [Ollama OpenAI Compatibility](https://ollama.com/blog/openai-compatibility)
- [Qwen3-Embedding on Ollama](https://ollama.com/library/qwen3-embedding)

### LM Studio

- [LM Studio Model Catalog](https://lmstudio.ai/models)
- [LM Studio Bug: Qwen3 Embedding shown as LLM](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/696)

### Platform Dependencies

- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [Meilisearch Documentation](https://www.meilisearch.com/docs)
- [n8n Documentation](https://docs.n8n.io)
- [Firecrawl Documentation](https://docs.firecrawl.dev)
- [OpenRouter API](https://openrouter.ai/docs)
