# n8n Workflow Setup Guide

This guide explains how to set up the n8n workflows for Ground News Sri Lanka.

## Prerequisites

- n8n instance (self-hosted or cloud)
- Supabase project with migrations applied
- API keys for: Firecrawl, OpenRouter, OpenAI

## Environment Variables

Add these environment variables to your n8n instance:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
FIRECRAWL_API_KEY=fc-your-key
OPENROUTER_API_KEY=your-openrouter-key
OPENAI_API_KEY=sk-your-key
```

## Credentials Setup

### 1. Supabase API Credential

Create a credential named `Supabase API` with:
- **Host URL**: Your Supabase URL
- **Service Role Secret**: Your service role key

### 2. Import Workflows

Import each workflow JSON file:

1. Go to n8n → Workflows → Import
2. Select the JSON file
3. Save and activate

## Workflows

### 1. Article Ingestion (`article-ingestion.json`)

**Purpose**: Fetches new articles from RSS feeds and scrapes full content.

**Schedule**: Every 30 minutes

**Flow**:
1. Get active sources with RSS feeds from Supabase
2. Fetch and parse RSS feed for each source
3. Filter out already-ingested articles
4. Scrape full article content using Firecrawl
5. Insert new articles into Supabase

**Required Credentials**:
- Supabase API
- Firecrawl API (via HTTP header)

### 2. Article Enrichment (`article-enrichment.json`)

**Purpose**: Analyzes articles for bias, sentiment, topics, and generates embeddings.

**Schedule**: Every hour

**Flow**:
1. Get un-enriched articles (where `ai_enriched_at IS NULL`)
2. Send to OpenRouter for analysis (bias, topics, sentiment, summary)
3. Generate embeddings using OpenAI
4. Update article with enrichment data

**Required Credentials**:
- Supabase API
- OpenRouter API (via HTTP header)
- OpenAI API (via HTTP header)

### 3. Story Clustering (`story-clustering.json`)

**Purpose**: Groups related articles into stories using vector similarity.

**Schedule**: Every 2 hours

**Flow**:
1. Get unclustered articles from last 48 hours
2. Calculate cosine similarity between article embeddings
3. Group articles with >0.85 similarity using Union-Find
4. Create story records for each cluster
5. Link articles to stories
6. Update story statistics (bias distribution, counts)

**Required Credentials**:
- Supabase API

## Testing Workflows

### Manual Trigger

Each workflow can be triggered manually for testing:

1. Open the workflow
2. Click "Execute Workflow"
3. Check execution results

### Test with Sample Data

1. Add a test source to the database
2. Run Article Ingestion manually
3. Verify articles appear in `articles` table
4. Run Article Enrichment
5. Verify `ai_bias_score`, `topics`, `embedding` are populated
6. Run Story Clustering
7. Verify stories are created in `stories` table

## Troubleshooting

### Articles Not Being Scraped

- Check Firecrawl API key is valid
- Verify RSS feed URL is accessible
- Check rate limits (2-second delay between scrapes)

### Enrichment Failing

- Verify OpenRouter API key
- Check article content is not empty
- Review OpenRouter model availability

### Clustering Not Working

- Ensure articles have embeddings
- Check similarity threshold (default 0.85)
- Verify vector extension is enabled in Supabase

## Monitoring

### Key Metrics to Watch

- Articles ingested per day
- Enrichment success rate
- Stories created per day
- API rate limit usage

### Logs

Enable detailed logging in n8n settings for debugging:
- Set `N8N_LOG_LEVEL=debug`
- Check execution history for errors
