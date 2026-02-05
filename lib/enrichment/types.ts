// Enrichment pipeline types
// All interfaces for the unified article analysis + entity extraction + translation pipeline.

export type DetectedLanguage = 'en' | 'si' | 'ta';

// Import + re-export ArticleType from shared types to avoid duplication
import type { ArticleType } from '@/lib/types';
export type { ArticleType };

export type Sentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

export type EntityType = 'person' | 'organization' | 'location' | 'topic';

// Input to the enrichment service
export interface ArticleInput {
  id: string;
  title: string;
  content: string;
  source_id: string;
  url: string;
  published_at: string | null;
  language?: string; // from DB, may be inaccurate
}

// Raw LLM analysis response (what the prompt asks for)
export interface AnalysisResult {
  summary: string;
  topics: string[];
  bias_score: number;
  sentiment: Sentiment;
  bias_indicators: string[];
  is_original_reporting: boolean;
  article_type: ArticleType;
  crime_type: string | null;
  locations: string[];
  law_enforcement: string[];
  police_station: string | null;
  political_party: string | null;
  election_info: ElectionInfo | null;
  key_people: PersonMention[];
  key_quotes: QuoteMention[];
  casualties: CasualtyInfo | null;
  monetary_amounts: MonetaryAmount[];
  entities: RawEntity[];
}

export interface ElectionInfo {
  type: 'presidential' | 'parliamentary' | 'provincial' | 'local';
  constituency: string;
  result: 'winner' | 'loser' | null;
  votes: string | null;
}

export interface PersonMention {
  name: string;
  role?: string;
}

export interface QuoteMention {
  text: string;
  speaker?: string;
}

export interface CasualtyInfo {
  deaths: number;
  injuries: number;
  description: string;
}

export interface MonetaryAmount {
  amount: number;
  currency: string;
  context: string;
}

export interface RawEntity {
  name: string;
  type: EntityType;
}

// Resolved entity after alias processing
export interface ResolvedEntity {
  name: string;
  canonical_name: string;
  type: EntityType;
  confidence: number;
}

// Tag assignment to write to DB
export interface TagAssignment {
  id: string; // tag UUID from database
  tag_slug: string;
  tag_name: string;
  tag_type: string;
  confidence: number;
  // Optional location data from sri_lanka_locations
  latitude?: number;
  longitude?: number;
  district?: string;
  province?: string;
  name_si?: string;
}

// Final enrichment output
export interface EnrichmentResult {
  // Core analysis
  summary: string;
  topics: string[];
  bias_score: number;
  sentiment: Sentiment;
  is_original_reporting: boolean;
  article_type: ArticleType;

  // Entities & crime
  crime_type: string | null;
  locations: string[];
  law_enforcement: string[];
  police_station: string | null;
  political_party: string | null;
  election_info: ElectionInfo | null;

  // New fields
  key_people: string[];
  key_quotes: string[];
  reading_time: number;
  casualties: CasualtyInfo | null;
  monetary_amounts: MonetaryAmount[];

  // Language
  detected_language: DetectedLanguage;

  // Translations (generated for cross-language articles)
  title_si: string | null;
  title_en: string | null;
  summary_si: string | null;
  summary_en: string | null;

  // Tag names translated to Sinhala
  tag_translations: Record<string, string>; // slug -> name_si

  // Tags to create/link
  tags: TagAssignment[];

  // Embedding
  embedding: number[] | null;
}

// LLM client options
export interface LLMOptions {
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
  json_mode?: boolean;
}

export interface LLMClientConfig {
  provider: 'openrouter' | 'ollama';
  openrouterKey?: string;
  openrouterModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

export interface EmbeddingConfig {
  ollamaUrl: string;
  model: string;
  dimensions: number;
}
