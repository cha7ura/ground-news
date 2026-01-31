-- Ground News Sri Lanka - i18n Support, Tags System, and Multi-language Articles
-- Migration 003

-- ============================================
-- i18n FIELDS ON EXISTING TABLES
-- ============================================

-- Articles: language tracking and bilingual title/summary
ALTER TABLE articles ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS original_language TEXT DEFAULT 'en';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS title_si TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS summary_si TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS summary_en TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_backfill BOOLEAN DEFAULT false;

-- Stories: bilingual title/summary
ALTER TABLE stories ADD COLUMN IF NOT EXISTS title_si TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS summary_si TEXT;

-- Sources: multi-language support
ALTER TABLE sources ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY['en'];

-- Index on article language for filtering
CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language);

-- ============================================
-- TAGS TABLE
-- Entity tags for articles (persons, orgs, locations, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_si TEXT,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('person', 'organization', 'location', 'topic', 'event', 'custom')),
  description TEXT,
  description_si TEXT,
  article_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by TEXT DEFAULT 'ai',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- ARTICLE_TAGS JUNCTION TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS article_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  confidence FLOAT DEFAULT 1.0,
  source TEXT DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(article_id, tag_id)
);

-- ============================================
-- STORY_TAGS JUNCTION TABLE
-- Derived from article tags for quick story-level queries
-- ============================================
CREATE TABLE IF NOT EXISTS story_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  article_count INT DEFAULT 1,
  UNIQUE(story_id, tag_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_active ON tags(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_article_tags_article ON article_tags(article_id);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_story_tags_story ON story_tags(story_id);
CREATE INDEX IF NOT EXISTS idx_story_tags_tag ON story_tags(tag_id);

-- ============================================
-- TRIGGER: Auto-update tag article_count
-- ============================================
CREATE OR REPLACE FUNCTION update_tag_article_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tags SET article_count = article_count + 1, updated_at = NOW() WHERE id = NEW.tag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tags SET article_count = article_count - 1, updated_at = NOW() WHERE id = OLD.tag_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_tag_article_count ON article_tags;
CREATE TRIGGER trg_update_tag_article_count
AFTER INSERT OR DELETE ON article_tags
FOR EACH ROW
EXECUTE FUNCTION update_tag_article_count();

-- ============================================
-- FUNCTION: Get articles by tag slug
-- ============================================
CREATE OR REPLACE FUNCTION get_articles_by_tag(
  p_tag_slug TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  article_id UUID,
  tag_name TEXT,
  tag_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT at2.article_id, t.name, t.type
  FROM article_tags at2
  JOIN tags t ON at2.tag_id = t.id
  WHERE t.slug = p_tag_slug AND t.is_active = true
  ORDER BY at2.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ============================================
-- SEED DATA: Additional Sri Lankan news sources
-- ============================================

-- Ada Derana (English)
INSERT INTO sources (name, slug, url, rss_url, bias_score, factuality_score, description, language, languages, scrape_config)
VALUES (
  'Ada Derana',
  'ada-derana-en',
  'https://www.adaderana.lk',
  'https://www.adaderana.lk/rss.php',
  0.1,
  65,
  'Ada Derana English - One of Sri Lanka''s most popular news portals with comprehensive coverage.',
  'en',
  ARRAY['en'],
  '{"article_selector": "article", "content_selector": ".news-content"}'
)
ON CONFLICT (slug) DO NOTHING;

-- Ada Derana (Sinhala)
INSERT INTO sources (name, slug, url, rss_url, bias_score, factuality_score, description, language, languages, scrape_config)
VALUES (
  'අද දෙරණ',
  'ada-derana-si',
  'https://sinhala.adaderana.lk',
  'https://sinhala.adaderana.lk/rss.php',
  0.1,
  65,
  'Ada Derana Sinhala - Leading Sinhala-language news portal.',
  'si',
  ARRAY['si'],
  '{"article_selector": "article", "content_selector": ".news-content"}'
)
ON CONFLICT (slug) DO NOTHING;

-- Lankadeepa (Sinhala)
INSERT INTO sources (name, slug, url, rss_url, bias_score, factuality_score, description, language, languages, scrape_config)
VALUES (
  'ලංකාදීප',
  'lankadeepa',
  'https://www.lankadeepa.lk',
  'https://www.lankadeepa.lk/rss',
  0.2,
  60,
  'Lankadeepa - The most widely read Sinhala-language newspaper in Sri Lanka.',
  'si',
  ARRAY['si'],
  '{"article_selector": "article", "content_selector": ".news-body"}'
)
ON CONFLICT (slug) DO NOTHING;

-- Update existing Daily Mirror source with languages array
UPDATE sources SET languages = ARRAY['en'] WHERE slug = 'daily-mirror';

-- News19 / NewsFirst
INSERT INTO sources (name, slug, url, rss_url, bias_score, factuality_score, description, language, languages, scrape_config)
VALUES (
  'News 1st',
  'news1st',
  'https://english.newsfirst.lk',
  NULL,
  0.0,
  55,
  'News 1st - Sri Lanka''s first trilingual news website, part of the Capital Maharaja Organization.',
  'en',
  ARRAY['en', 'si'],
  '{"scrape_homepage": true, "article_selector": "article"}'
)
ON CONFLICT (slug) DO NOTHING;
