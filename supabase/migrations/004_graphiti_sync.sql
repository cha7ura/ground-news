-- Track which articles have been synced to Graphiti knowledge graph
ALTER TABLE articles ADD COLUMN IF NOT EXISTS graphiti_synced_at timestamptz;
