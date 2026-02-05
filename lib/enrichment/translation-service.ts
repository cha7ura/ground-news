// Translation service — generates cross-language summaries and tag name translations.
// English articles → Sinhala summary/title, Sinhala articles → English summary/title.

import type { DetectedLanguage, TagAssignment } from './types';
import { LLMClient, parseJSON } from './llm-client';

interface TranslationResult {
  title_si: string | null;
  title_en: string | null;
  summary_si: string | null;
  summary_en: string | null;
}

interface TagTranslations {
  [slug: string]: string; // tag slug → translated name_si
}

export class TranslationService {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * Translate article title and summary to the opposite language.
   * Returns null fields for same-language translations (no work needed).
   */
  async translateArticle(
    title: string,
    summary: string,
    sourceLanguage: DetectedLanguage,
  ): Promise<TranslationResult> {
    const result: TranslationResult = {
      title_si: null,
      title_en: null,
      summary_si: null,
      summary_en: null,
    };

    // Tamil → English translation (Sinhala not attempted for Tamil)
    if (sourceLanguage === 'ta') {
      const translated = await this.translateToEnglish(title, summary, 'Tamil');
      if (translated) {
        result.title_en = translated.title;
        result.summary_en = translated.summary;
      }
      return result;
    }

    if (sourceLanguage === 'si') {
      // Sinhala → English
      const translated = await this.translateToEnglish(title, summary, 'Sinhala');
      if (translated) {
        result.title_en = translated.title;
        result.summary_en = translated.summary;
      }
    } else {
      // English → Sinhala
      const translated = await this.translateToSinhala(title, summary);
      if (translated) {
        result.title_si = translated.title;
        result.summary_si = translated.summary;
      }
    }

    return result;
  }

  /**
   * Translate tag names to Sinhala for tags that don't have name_si yet.
   * Batches up to 20 tag names in a single LLM call.
   */
  async translateTagNames(tags: TagAssignment[]): Promise<TagTranslations> {
    // Filter tags that don't already have Sinhala names
    const needsTranslation = tags.filter(t => !t.name_si).slice(0, 20);
    if (needsTranslation.length === 0) return {};

    const nameList = needsTranslation.map(t => `"${t.tag_slug}": "${t.tag_name}"`).join(',\n  ');

    const prompt = `Translate these Sri Lankan news entity names to Sinhala (සිංහල).
Keep proper nouns recognizable. Return ONLY a JSON object mapping slug to Sinhala name.

Input:
{
  ${nameList}
}

Output (translate the values only):`;

    try {
      const response = await this.llm.complete(prompt, {
        temperature: 0.2,
        max_tokens: 1000,
        timeout: 60_000,
      });

      const parsed = parseJSON<Record<string, string>>(response);
      if (!parsed) return {};

      // Validate: only keep entries that exist in our input
      const validSlugs = new Set(needsTranslation.map(t => t.tag_slug));
      const result: TagTranslations = {};
      for (const [slug, nameSi] of Object.entries(parsed)) {
        if (validSlugs.has(slug) && typeof nameSi === 'string' && nameSi.trim()) {
          result[slug] = nameSi.trim();
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private async translateToEnglish(
    title: string,
    summary: string,
    fromLanguage: string,
  ): Promise<{ title: string; summary: string } | null> {
    const prompt = `Translate this ${fromLanguage} news title and summary to English.
Keep proper nouns (names, places) in their common English form.
Respond with ONLY a JSON object:

Title: ${title}
Summary: ${summary}

{"title_en": "English title", "summary_en": "English summary"}`;

    try {
      const response = await this.llm.complete(prompt, {
        temperature: 0.2,
        max_tokens: 500,
        timeout: 60_000,
      });

      const parsed = parseJSON<{ title_en?: string; summary_en?: string }>(response);
      if (!parsed?.title_en) return null;

      return {
        title: parsed.title_en,
        summary: parsed.summary_en || '',
      };
    } catch {
      return null;
    }
  }

  private async translateToSinhala(
    title: string,
    summary: string,
  ): Promise<{ title: string; summary: string } | null> {
    const prompt = `Translate this English news title and summary to Sinhala (සිංහල).
Keep proper nouns recognizable.
Respond with ONLY a JSON object:

Title: ${title}
Summary: ${summary}

{"title_si": "සිංහල මාතෘකාව", "summary_si": "සිංහල සාරාංශය"}`;

    try {
      const response = await this.llm.complete(prompt, {
        temperature: 0.2,
        max_tokens: 500,
        timeout: 60_000,
      });

      const parsed = parseJSON<{ title_si?: string; summary_si?: string }>(response);
      if (!parsed?.title_si) return null;

      return {
        title: parsed.title_si,
        summary: parsed.summary_si || '',
      };
    } catch {
      return null;
    }
  }
}
