// Enrichment service — main orchestrator.
// Coordinates: language detection → LLM analysis → entity handling → translation → embedding.

import { createClient } from '@supabase/supabase-js';
import type {
  ArticleInput,
  AnalysisResult,
  EnrichmentResult,
  LLMClientConfig,
  EmbeddingConfig,
  DetectedLanguage,
  CasualtyInfo,
  MonetaryAmount,
} from './types';
import { detectLanguage } from './language-detector';
import { buildAnalysisPrompt } from './prompts';
import { LLMClient, parseJSON } from './llm-client';
import { EntityHandler } from './entity-handler';
import { TranslationService } from './translation-service';

export class EnrichmentService {
  private llm: LLMClient;
  private entityHandler: EntityHandler;
  private translationService: TranslationService;
  private supabase: ReturnType<typeof createClient>;
  private embeddingConfig: EmbeddingConfig;

  constructor(
    supabase: ReturnType<typeof createClient>,
    llmConfig: LLMClientConfig,
    embeddingConfig: EmbeddingConfig,
  ) {
    this.supabase = supabase;
    this.llm = new LLMClient(llmConfig);
    this.entityHandler = new EntityHandler(supabase);
    this.translationService = new TranslationService(this.llm);
    this.embeddingConfig = embeddingConfig;
  }

  /**
   * Enrich a single article: analyze, extract entities, translate, embed.
   * Returns null if analysis fails (caller should skip this article).
   */
  async enrichArticle(article: ArticleInput): Promise<EnrichmentResult | null> {
    // 1. Detect language
    const detected = detectLanguage(`${article.title}\n${article.content}`);

    // 2. Build language-appropriate prompt and run LLM analysis
    const prompt = buildAnalysisPrompt(detected, article.title, article.content);
    let responseText: string;
    try {
      responseText = await this.llm.complete(prompt, {
        temperature: 0.3,
        max_tokens: 12000,
        json_mode: true,
      });
    } catch {
      return null;
    }

    const analysis = parseJSON<AnalysisResult>(responseText);
    if (!analysis?.summary) return null;

    // 3. Calculate reading time from content word count
    const wordCount = article.content.split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // 4. Process entities and create tags
    const tags = await this.entityHandler.processAnalysis(article.id, analysis);

    // 5. Translate article title + summary to the other language
    let translationResult = { title_si: null as string | null, title_en: null as string | null, summary_si: null as string | null, summary_en: null as string | null };
    try {
      translationResult = await this.translationService.translateArticle(
        article.title,
        analysis.summary,
        detected,
      );
    } catch {
      // Translation is best-effort
    }

    // 6. Translate tag names to Sinhala
    let tagTranslations: Record<string, string> = {};
    try {
      tagTranslations = await this.translationService.translateTagNames(tags);
      if (Object.keys(tagTranslations).length > 0) {
        await this.entityHandler.updateTagTranslations(tagTranslations);
      }
    } catch {
      // Tag translation is best-effort
    }

    // 7. Generate embedding
    const embeddingInput = `${article.title}\n\n${article.content.slice(0, 6000)}`;
    const embedding = await this.generateEmbedding(embeddingInput);

    // 8. Normalize key_people to string array
    const keyPeople: string[] = (analysis.key_people || [])
      .map(p => typeof p === 'string' ? p : p.name)
      .filter(Boolean)
      .slice(0, 5);

    // 9. Normalize key_quotes to string array
    const keyQuotes: string[] = (analysis.key_quotes || [])
      .map(q => {
        if (typeof q === 'string') return q;
        const speaker = q.speaker ? `— ${q.speaker}` : '';
        return q.text ? `${q.text} ${speaker}`.trim() : '';
      })
      .filter(Boolean)
      .slice(0, 3);

    // 10. Validate and normalize casualties
    let casualties: CasualtyInfo | null = null;
    if (analysis.casualties && (analysis.casualties.deaths > 0 || analysis.casualties.injuries > 0)) {
      casualties = {
        deaths: Math.max(0, Number(analysis.casualties.deaths) || 0),
        injuries: Math.max(0, Number(analysis.casualties.injuries) || 0),
        description: String(analysis.casualties.description || '').slice(0, 200),
      };
    }

    // 11. Validate monetary amounts
    const monetaryAmounts: MonetaryAmount[] = (analysis.monetary_amounts || [])
      .filter(m => m && typeof m.amount === 'number' && m.amount > 0)
      .map(m => ({
        amount: m.amount,
        currency: String(m.currency || 'LKR').slice(0, 10),
        context: String(m.context || '').slice(0, 100),
      }))
      .slice(0, 5);

    // 12. Validate article_type
    const validTypes = new Set(['news', 'opinion', 'analysis', 'interview']);
    const articleType = validTypes.has(analysis.article_type)
      ? analysis.article_type
      : 'news';

    return {
      summary: analysis.summary,
      topics: (analysis.topics || []).slice(0, 5),
      bias_score: Math.max(-1, Math.min(1, Number(analysis.bias_score) || 0)),
      sentiment: ['positive', 'negative', 'neutral', 'mixed'].includes(analysis.sentiment)
        ? analysis.sentiment
        : 'neutral',
      is_original_reporting: Boolean(analysis.is_original_reporting),
      article_type: articleType,

      crime_type: analysis.crime_type || null,
      locations: (analysis.locations || []).slice(0, 5),
      law_enforcement: (analysis.law_enforcement || []).slice(0, 3),
      police_station: analysis.police_station || null,
      political_party: analysis.political_party || null,
      election_info: analysis.election_info || null,

      key_people: keyPeople,
      key_quotes: keyQuotes,
      reading_time: readingTime,
      casualties,
      monetary_amounts: monetaryAmounts,

      detected_language: detected,

      title_si: translationResult.title_si,
      title_en: translationResult.title_en,
      summary_si: translationResult.summary_si,
      summary_en: translationResult.summary_en,

      tag_translations: tagTranslations,
      tags,
      embedding,
    };
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      const res = await fetch(`${this.embeddingConfig.ollamaUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingConfig.model,
          input: text.slice(0, 8000),
          dimensions: this.embeddingConfig.dimensions,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = (await res.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      const embedding = data.data?.[0]?.embedding;
      return embedding && embedding.length === this.embeddingConfig.dimensions ? embedding : null;
    } catch {
      return null;
    }
  }
}
