# Ground News Sri Lanka

A Ground News-style news aggregation platform for Sri Lanka. Compare how different news sources cover the same stories and understand media bias.

## Features

- **Multi-source aggregation**: Aggregate news from multiple Sri Lankan news outlets
- **Story clustering**: Group articles about the same news event using AI embeddings
- **Bias analysis**: AI-powered political bias scoring for articles and sources
- **Source comparison**: Side-by-side comparison of how different sources cover stories
- **Topic categorization**: Automatic categorization of articles by topic

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Database | Supabase (PostgreSQL + pgvector) |
| Search | Meilisearch |
| Orchestration | n8n workflows |
| Scraping | Firecrawl |
| AI | OpenRouter (GPT-4o-mini), OpenAI embeddings |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      n8n Workflows                          │
├──────────────┬──────────────────┬──────────────────────────┤
│ Ingestion    │ Enrichment       │ Clustering               │
│ (RSS + Crawl)│ (Bias + Topics)  │ (Vector Similarity)      │
└──────┬───────┴────────┬─────────┴────────────┬─────────────┘
       │                │                      │
       ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                               │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────────┐  │
│  │ sources │  │ articles │  │ stories│  │ story_articles│  │
│  └─────────┘  └──────────┘  └────────┘  └───────────────┘  │
│                    │ (vector embeddings)                    │
└────────────────────┼────────────────────────────────────────┘
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
┌─────────────┐            ┌─────────────────┐
│ Meilisearch │            │ Next.js Frontend │
│ (search)    │◄───────────│                 │
└─────────────┘            └─────────────────┘
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Meilisearch instance
- n8n instance
- API keys: OpenAI, OpenRouter, Firecrawl

### Setup

1. **Clone and install dependencies**

```bash
cd ground-news
npm install
```

2. **Configure environment variables**

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

3. **Run database migrations**

```bash
# Using Supabase CLI
supabase db push
```

4. **Initialize Meilisearch indexes**

```bash
npm run meilisearch:init
```

5. **Import n8n workflows**

Import the workflows from `n8n/workflows/`:
- `article-ingestion.json` - Fetches articles from RSS feeds
- `article-enrichment.json` - Analyzes articles for bias and topics
- `story-clustering.json` - Groups related articles into stories

6. **Start the development server**

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## n8n Workflow Setup

### Environment Variables for n8n

Configure these in your n8n instance:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `FIRECRAWL_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`

### Workflow Schedule

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| Article Ingestion | Every 30 min | Fetch new articles from RSS feeds |
| Article Enrichment | Every hour | Analyze articles for bias/topics |
| Story Clustering | Every 2 hours | Group similar articles |

## Adding New Sources

1. Insert a new source in the `sources` table:

```sql
INSERT INTO sources (name, slug, url, rss_url, bias_score, factuality_score, description)
VALUES (
  'News Source Name',
  'news-source-slug',
  'https://example.com',
  'https://example.com/rss',
  0.0,  -- Bias: -1 (left) to 1 (right)
  70,   -- Factuality: 0-100
  'Description of the source'
);
```

2. The ingestion workflow will automatically pick up the new source.

## Bias Rating System

| Score | Label | Description |
|-------|-------|-------------|
| -1.0 to -0.6 | Far Left | Strong opposition/progressive leaning |
| -0.6 to -0.3 | Left | Moderate opposition leaning |
| -0.3 to 0.3 | Center | Balanced/neutral coverage |
| 0.3 to 0.6 | Right | Moderate government leaning |
| 0.6 to 1.0 | Far Right | Strong government/conservative leaning |

## Project Structure

```
ground-news/
├── app/                    # Next.js app router pages
│   ├── page.tsx           # Home - news feed
│   ├── story/[id]/        # Story detail with comparison
│   ├── source/[slug]/     # Source profile
│   ├── sources/           # All sources list
│   └── topics/            # Topic browser
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── story-card.tsx    # Story display card
│   ├── article-card.tsx  # Article display card
│   ├── bias-indicator.tsx # Bias distribution bar
│   └── header.tsx        # Site header
├── lib/                   # Utilities
│   ├── supabase.ts       # Database client
│   ├── meilisearch.ts    # Search client
│   └── types.ts          # TypeScript types
├── n8n/
│   └── workflows/        # n8n workflow JSON files
└── supabase/
    └── migrations/       # Database migrations
```

## License

MIT
