// Prompt builder — selects the right bilingual template based on detected language.

import type { DetectedLanguage } from '../types';
import { buildEnglishPrompt } from './english';
import { buildSinhalaPrompt } from './sinhala';
import { buildTamilPrompt } from './tamil';

/**
 * Build the unified analysis prompt for an article.
 * Selects the language-appropriate template so that smaller LLMs
 * can better understand non-English content.
 */
export function buildAnalysisPrompt(
  language: DetectedLanguage,
  title: string,
  content: string,
): string {
  switch (language) {
    case 'si':
      return buildSinhalaPrompt(title, content);
    case 'ta':
      return buildTamilPrompt(title, content);
    default:
      return buildEnglishPrompt(title, content);
  }
}
