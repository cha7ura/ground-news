// Enrichment module — unified article analysis, entity extraction, and translation.
//
// Usage:
//   import { EnrichmentService, detectLanguage } from '@/lib/enrichment';
//
//   const service = new EnrichmentService(supabase, llmConfig, embeddingConfig);
//   const result = await service.enrichArticle(article);

export { EnrichmentService } from './enrichment-service';
export { detectLanguage } from './language-detector';
export { resolveAlias, isKnownAlias } from './aliases';
export { LLMClient, parseJSON } from './llm-client';
export { EntityHandler } from './entity-handler';
export { TranslationService } from './translation-service';
export { buildAnalysisPrompt } from './prompts';

export type {
  ArticleInput,
  AnalysisResult,
  EnrichmentResult,
  DetectedLanguage,
  LLMClientConfig,
  EmbeddingConfig,
  TagAssignment,
  CasualtyInfo,
  MonetaryAmount,
  PersonMention,
  QuoteMention,
  EntityType,
  ArticleType,
  Sentiment,
} from './types';
