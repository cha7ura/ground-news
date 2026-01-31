# Docker Services

All infrastructure services run via `docker-compose.yml` in the project root. Supabase runs separately via its own CLI.

## Quick Start

```bash
# Start all Docker services
docker compose up -d

# Pull the embedding model (first time only)
docker exec ground-news-ollama ollama pull qwen3-embedding:0.6b

# Start Supabase (separate from Docker Compose)
supabase start
```

## Services

| Service              | Container Name                 | Port  | Purpose                    |
| -------------------- | ------------------------------ | ----- | -------------------------- |
| meilisearch          | ground-news-meilisearch        | 7700  | Full-text search           |
| redis                | ground-news-redis              | 6379  | Firecrawl job queue        |
| firecrawl-playwright | ground-news-playwright         | 3100  | Browser automation         |
| firecrawl-postgres   | ground-news-firecrawl-postgres | —     | Firecrawl NUQ job queue DB |
| firecrawl-rabbitmq   | ground-news-firecrawl-rabbitmq | —     | Firecrawl message broker   |
| firecrawl            | ground-news-firecrawl          | 3002  | Web scraping API           |
| n8n                  | ground-news-n8n                | 5678  | Workflow orchestration     |
| ollama               | ground-news-ollama             | 11434 | Embedding model server     |

## Firecrawl Dependencies

Firecrawl (as of 2025) requires its own PostgreSQL and RabbitMQ instances for internal job management. These are **internal-only services** — no ports are exposed to the host.

### `firecrawl-init.sql`

The file `docker/firecrawl-init.sql` initializes the Firecrawl NUQ (job queue) schema in its dedicated PostgreSQL instance. It is mounted as a Docker entrypoint init script.

**Source**: Adapted from [upstream nuq.sql](https://github.com/firecrawl/firecrawl/blob/main/apps/nuq-postgres/nuq.sql) with the following changes for local development:

- Removed `CREATE EXTENSION IF NOT EXISTS pg_cron` (not available in `postgres:16-alpine`)
- Removed all `cron.schedule()` job definitions (stale job cleanup, backlog processing)
- Kept all table definitions, indexes, enums, and the `pgcrypto` extension

**Note**: If the Firecrawl Postgres container already has data, the init script won't re-run. To force re-initialization:

```bash
docker compose down
docker volume rm ground-news_firecrawl_postgres_data
docker compose up -d
```

## n8n Workflow Orchestration

n8n runs the three core data pipeline workflows:

1. **Article Ingestion** (every 30 min) — RSS fetch + Firecrawl scraping
2. **Article Enrichment** (every 1 hour) — LLM analysis + embedding generation
3. **Story Clustering** (every 2 hours) — Vector similarity clustering

Access the n8n editor UI at http://localhost:5678.

### n8n Environment Variables

n8n receives service URLs as internal Docker network addresses (e.g., `http://meilisearch:7700`), so workflows can reach other services without going through the host.

The exception is Supabase, which runs outside Docker Compose — n8n reaches it via `host.docker.internal:54321`.

## Ollama

On first start, you need to pull the embedding model:

```bash
docker exec ground-news-ollama ollama pull qwen3-embedding:0.6b
```

Or use the setup script: `./scripts/ollama-setup.sh`

The `OLLAMA_KEEP_ALIVE=-1` setting keeps the model loaded in memory permanently to avoid cold-start latency.

## Volumes

| Volume                  | Service            | Contents                |
| ----------------------- | ------------------ | ----------------------- |
| meilisearch_data        | meilisearch        | Search indexes          |
| redis_data              | redis              | Cache/queue data        |
| ollama_data             | ollama             | Downloaded models       |
| firecrawl_postgres_data | firecrawl-postgres | NUQ job queue tables    |
| n8n_data                | n8n                | Workflows, credentials  |
