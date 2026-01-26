-- Ground News Sri Lanka - Initial Schema
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- SOURCES TABLE
-- News outlets with bias and factuality metadata
-- ============================================
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  logo_url TEXT,
  favicon_url TEXT,
  
  -- Bias and factuality scores
  bias_score FLOAT DEFAULT 0 CHECK (bias_score >= -1.0 AND bias_score <= 1.0),
  -- -1.0 = far left, 0 = center, 1.0 = far right
  factuality_score INT DEFAULT 50 CHECK (factuality_score >= 0 AND factuality_score <= 100),
  
  -- Ingestion configuration
  rss_url TEXT,
  scrape_config JSONB DEFAULT '{}',
  -- Example: {"article_selector": "article.story", "content_selector": ".story-text"}
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_scraped_at TIMESTAMP,
  article_count INT DEFAULT 0,
  
  -- Metadata
  description TEXT,
  country TEXT DEFAULT 'LK',
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ARTICLES TABLE
-- Individual news articles from sources
-- ============================================
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  
  -- Core content
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT, -- Full article text (markdown)
  summary TEXT, -- AI-generated 2-sentence summary
  excerpt TEXT, -- First 200 chars or meta description
  
  -- Media
  image_url TEXT,
  
  -- Metadata
  author TEXT,
  published_at TIMESTAMP,
  scraped_at TIMESTAMP DEFAULT NOW(),
  
  -- AI enrichment
  topics TEXT[] DEFAULT '{}', -- Array of topic keywords
  ai_bias_score FLOAT CHECK (ai_bias_score IS NULL OR (ai_bias_score >= -1.0 AND ai_bias_score <= 1.0)),
  ai_sentiment TEXT CHECK (ai_sentiment IS NULL OR ai_sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  ai_enriched_at TIMESTAMP,
  
  -- Vector embedding for similarity search (OpenAI ada-002 = 1536 dimensions)
  embedding vector(1536),
  
  -- Story clustering
  story_id UUID, -- Will be linked after stories table is created
  
  -- Status
  is_processed BOOLEAN DEFAULT false,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- STORIES TABLE
-- Clustered story groups (multiple articles about same event)
-- ============================================
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core info
  title TEXT NOT NULL, -- Representative headline
  summary TEXT, -- AI-generated story summary
  primary_topic TEXT,
  
  -- Coverage stats
  article_count INT DEFAULT 0,
  source_count INT DEFAULT 0,
  
  -- Bias distribution across sources covering this story
  bias_distribution JSONB DEFAULT '{"left": 0, "center": 0, "right": 0}',
  -- Example: {"left": 2, "center": 5, "right": 1}
  
  -- Featured image (from most prominent article)
  image_url TEXT,
  
  -- Timeline
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_trending BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key from articles to stories
ALTER TABLE articles ADD CONSTRAINT fk_articles_story 
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL;

-- ============================================
-- STORY_ARTICLES JUNCTION TABLE
-- Many-to-many relationship (though articles typically belong to one story)
-- Useful for tracking clustering confidence
-- ============================================
CREATE TABLE story_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  
  -- Clustering metadata
  similarity_score FLOAT, -- How similar to the story's seed article (0-1)
  is_seed_article BOOLEAN DEFAULT false, -- The first article that started this cluster
  
  -- Timestamps
  added_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(story_id, article_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Sources
CREATE INDEX idx_sources_slug ON sources(slug);
CREATE INDEX idx_sources_is_active ON sources(is_active);

-- Articles
CREATE INDEX idx_articles_source ON articles(source_id);
CREATE INDEX idx_articles_story ON articles(story_id);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_url ON articles(url);
CREATE INDEX idx_articles_topics ON articles USING GIN(topics);
CREATE INDEX idx_articles_not_enriched ON articles(id) WHERE ai_enriched_at IS NULL AND content IS NOT NULL;
CREATE INDEX idx_articles_not_clustered ON articles(id) WHERE story_id IS NULL AND embedding IS NOT NULL;

-- Vector similarity index (IVFFlat for faster approximate search)
CREATE INDEX idx_articles_embedding ON articles 
  USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

-- Stories
CREATE INDEX idx_stories_updated ON stories(last_updated_at DESC);
CREATE INDEX idx_stories_topic ON stories(primary_topic);
CREATE INDEX idx_stories_trending ON stories(is_trending) WHERE is_trending = true;

-- Story articles
CREATE INDEX idx_story_articles_story ON story_articles(story_id);
CREATE INDEX idx_story_articles_article ON story_articles(article_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to find similar articles using vector similarity
CREATE OR REPLACE FUNCTION find_similar_articles(
  target_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.85,
  max_results INT DEFAULT 20,
  exclude_article_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_id UUID,
  title TEXT,
  url TEXT,
  published_at TIMESTAMP,
  story_id UUID,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.title,
    a.url,
    a.published_at,
    a.story_id,
    1 - (a.embedding <=> target_embedding) AS similarity
  FROM articles a
  WHERE a.embedding IS NOT NULL
    AND (exclude_article_id IS NULL OR a.id != exclude_article_id)
    AND 1 - (a.embedding <=> target_embedding) >= similarity_threshold
  ORDER BY a.embedding <=> target_embedding
  LIMIT max_results;
END;
$$;

-- Function to get unclustered articles from last N hours
CREATE OR REPLACE FUNCTION get_unclustered_articles(
  hours_ago INT DEFAULT 48
)
RETURNS TABLE (
  id UUID,
  source_id UUID,
  title TEXT,
  url TEXT,
  published_at TIMESTAMP,
  embedding vector(1536)
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.source_id,
    a.title,
    a.url,
    a.published_at,
    a.embedding
  FROM articles a
  WHERE a.story_id IS NULL
    AND a.embedding IS NOT NULL
    AND a.published_at >= NOW() - (hours_ago || ' hours')::INTERVAL
  ORDER BY a.published_at DESC;
END;
$$;

-- Function to update story stats after article changes
CREATE OR REPLACE FUNCTION update_story_stats(p_story_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_article_count INT;
  v_source_count INT;
  v_bias_dist JSONB;
BEGIN
  -- Count articles and unique sources
  SELECT 
    COUNT(*),
    COUNT(DISTINCT a.source_id)
  INTO v_article_count, v_source_count
  FROM story_articles sa
  JOIN articles a ON sa.article_id = a.id
  WHERE sa.story_id = p_story_id;
  
  -- Calculate bias distribution
  SELECT jsonb_build_object(
    'left', COUNT(*) FILTER (WHERE s.bias_score < -0.3),
    'center', COUNT(*) FILTER (WHERE s.bias_score >= -0.3 AND s.bias_score <= 0.3),
    'right', COUNT(*) FILTER (WHERE s.bias_score > 0.3)
  )
  INTO v_bias_dist
  FROM story_articles sa
  JOIN articles a ON sa.article_id = a.id
  JOIN sources s ON a.source_id = s.id
  WHERE sa.story_id = p_story_id;
  
  -- Update story
  UPDATE stories
  SET 
    article_count = v_article_count,
    source_count = v_source_count,
    bias_distribution = v_bias_dist,
    last_updated_at = NOW()
  WHERE id = p_story_id;
END;
$$;

-- Trigger to update source article count
CREATE OR REPLACE FUNCTION update_source_article_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sources SET article_count = article_count + 1 WHERE id = NEW.source_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sources SET article_count = article_count - 1 WHERE id = OLD.source_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_update_source_article_count
AFTER INSERT OR DELETE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_source_article_count();

-- ============================================
-- SEED DATA: Daily Mirror as first source
-- ============================================
INSERT INTO sources (name, slug, url, rss_url, bias_score, factuality_score, description, scrape_config)
VALUES (
  'Daily Mirror',
  'daily-mirror',
  'https://www.dailymirror.lk',
  'https://www.dailymirror.lk/RSS_Feed/breaking-news/108',
  0.0,
  70,
  'Daily Mirror is one of Sri Lanka''s leading English-language newspapers, known for balanced reporting.',
  '{"article_selector": "article", "content_selector": ".inner-content", "title_selector": "h1.inner-title"}'
);
