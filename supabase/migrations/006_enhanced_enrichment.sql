-- Ground News Sri Lanka - Enhanced Enrichment Fields & Entity Alias Resolution
-- Migration 006

-- ============================================
-- NEW COLUMNS ON ARTICLES TABLE
-- ============================================

-- Key people mentioned in article (full canonical names)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS key_people TEXT[] DEFAULT '{}';

-- Key direct quotes extracted from article
ALTER TABLE articles ADD COLUMN IF NOT EXISTS key_quotes TEXT[] DEFAULT '{}';

-- Article classification: news, opinion, analysis, interview
ALTER TABLE articles ADD COLUMN IF NOT EXISTS article_type TEXT
  CHECK (article_type IS NULL OR article_type IN ('news', 'opinion', 'analysis', 'interview'));

-- Estimated reading time in minutes
ALTER TABLE articles ADD COLUMN IF NOT EXISTS reading_time INT;

-- Casualty information for crime/accident/disaster articles
-- Format: {"deaths": 0, "injuries": 2, "description": "brief context"}
ALTER TABLE articles ADD COLUMN IF NOT EXISTS casualties JSONB;

-- Monetary amounts mentioned in article
-- Format: [{"amount": 500000, "currency": "LKR", "context": "seized cash"}]
ALTER TABLE articles ADD COLUMN IF NOT EXISTS monetary_amounts JSONB DEFAULT '[]';

-- Index for article_type filtering
CREATE INDEX IF NOT EXISTS idx_articles_article_type ON articles(article_type)
  WHERE article_type IS NOT NULL;

-- ============================================
-- ENTITY ALIASES TABLE
-- Maps abbreviations, short names, and Sinhala forms to canonical entity names
-- ============================================

CREATE TABLE IF NOT EXISTS entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  alias TEXT UNIQUE NOT NULL,       -- Stored lowercase for case-insensitive lookup
  entity_type TEXT DEFAULT 'person' CHECK (entity_type IN ('person', 'organization', 'location', 'topic')),
  confidence FLOAT DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical ON entity_aliases(canonical_name);

-- ============================================
-- SEED: Common Sri Lankan entity aliases
-- ============================================

-- Political figures
INSERT INTO entity_aliases (canonical_name, alias, entity_type, confidence) VALUES
  -- President
  ('Anura Kumara Dissanayake', 'akd', 'person', 1.0),
  ('Anura Kumara Dissanayake', 'anura', 'person', 0.9),
  ('Anura Kumara Dissanayake', 'anura kumara', 'person', 0.95),
  ('Anura Kumara Dissanayake', 'president dissanayake', 'person', 1.0),
  -- PM
  ('Harini Amarasuriya', 'harini', 'person', 0.9),
  ('Harini Amarasuriya', 'pm amarasuriya', 'person', 1.0),
  -- Former presidents
  ('Ranil Wickremesinghe', 'ranil', 'person', 0.9),
  ('Ranil Wickremesinghe', 'rw', 'person', 0.95),
  ('Gotabaya Rajapaksa', 'gotabaya', 'person', 0.95),
  ('Gotabaya Rajapaksa', 'gota', 'person', 0.95),
  ('Gotabaya Rajapaksa', 'gr', 'person', 0.9),
  ('Mahinda Rajapaksa', 'mahinda', 'person', 0.9),
  ('Mahinda Rajapaksa', 'mr', 'person', 0.85),
  -- Opposition
  ('Sajith Premadasa', 'sajith', 'person', 0.95),
  ('Basil Rajapaksa', 'basil', 'person', 0.9),
  ('Namal Rajapaksa', 'namal', 'person', 0.9)
ON CONFLICT (alias) DO NOTHING;

-- Political parties
INSERT INTO entity_aliases (canonical_name, alias, entity_type, confidence) VALUES
  ('Sri Lanka Podujana Peramuna', 'slpp', 'organization', 1.0),
  ('Sri Lanka Podujana Peramuna', 'pohottuwa', 'organization', 0.95),
  ('Samagi Jana Balawegaya', 'sjb', 'organization', 1.0),
  ('United National Party', 'unp', 'organization', 1.0),
  ('National People''s Power', 'npp', 'organization', 1.0),
  ('National People''s Power', 'jjb', 'organization', 1.0),
  ('Janatha Vimukthi Peramuna', 'jvp', 'organization', 1.0),
  ('Sri Lanka Freedom Party', 'slfp', 'organization', 1.0),
  ('Central Bank of Sri Lanka', 'cbsl', 'organization', 1.0),
  ('Central Bank of Sri Lanka', 'central bank', 'organization', 0.9),
  ('Criminal Investigation Department', 'cid', 'organization', 1.0),
  ('Special Task Force', 'stf', 'organization', 1.0),
  ('Financial Crimes Investigation Division', 'fcid', 'organization', 1.0),
  ('International Monetary Fund', 'imf', 'organization', 1.0)
ON CONFLICT (alias) DO NOTHING;

-- Function to look up canonical name from alias
CREATE OR REPLACE FUNCTION get_canonical_name(p_alias TEXT)
RETURNS TEXT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_canonical TEXT;
BEGIN
  SELECT canonical_name INTO v_canonical
  FROM entity_aliases
  WHERE alias = LOWER(TRIM(p_alias))
  ORDER BY confidence DESC
  LIMIT 1;
  RETURN COALESCE(v_canonical, p_alias);
END;
$$;
