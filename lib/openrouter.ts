const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is not set. LLM features will be disabled.');
}

export interface LanguageDetectionResult {
  language: string; // 'en', 'si', 'ta'
  confidence: number;
}

export interface BiasDetectionResult {
  hasBias: boolean;
  biasType?: string;
  missingLanguages?: string[];
  confidence: number;
  reasoning?: string;
}

/**
 * Detect the language of a text using OpenRouter LLM
 */
export async function detectLanguage(
  text: string
): Promise<LanguageDetectionResult> {
  if (!OPENROUTER_API_KEY) {
    // Fallback: simple heuristic-based detection
    return detectLanguageFallback(text);
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'system',
            content: 'You are a language detection expert. Identify the language of the given text. Respond with ONLY a JSON object: {"language": "en|si|ta", "confidence": 0.0-1.0}. "en" = English, "si" = Sinhala, "ta" = Tamil.',
          },
          {
            role: 'user',
            content: `Detect the language of this text: "${text.substring(0, 500)}"`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return {
          language: parsed.language || 'en',
          confidence: parsed.confidence || 0.5,
        };
      } catch {
        // If JSON parsing fails, try to extract from text
        const langMatch = content.match(/"language"\s*:\s*"([^"]+)"/);
        const confMatch = content.match(/"confidence"\s*:\s*([\d.]+)/);
        return {
          language: langMatch?.[1] || 'en',
          confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
        };
      }
    }

    return detectLanguageFallback(text);
  } catch (error) {
    console.error('Language detection error:', error);
    return detectLanguageFallback(text);
  }
}

/**
 * Fallback language detection using simple heuristics
 */
function detectLanguageFallback(text: string): LanguageDetectionResult {
  // Simple heuristic: check for Sinhala/Tamil Unicode ranges
  const sinhalaRegex = /[\u0D80-\u0DFF]/;
  const tamilRegex = /[\u0B80-\u0BFF]/;
  
  if (sinhalaRegex.test(text)) {
    return { language: 'si', confidence: 0.7 };
  }
  if (tamilRegex.test(text)) {
    return { language: 'ta', confidence: 0.7 };
  }
  
  return { language: 'en', confidence: 0.8 };
}

/**
 * Detect language bias in news reporting
 * Compares if a source reports certain news only in specific languages
 */
export async function detectLanguageBias(
  sourceId: string,
  articleTitle: string,
  articleDescription: string,
  articleLanguage: string,
  sourceSupportedLanguages: string[]
): Promise<BiasDetectionResult> {
  if (!OPENROUTER_API_KEY) {
    return {
      hasBias: false,
      confidence: 0.5,
    };
  }

  // Only check if source supports multiple languages
  if (sourceSupportedLanguages.length <= 1) {
    return {
      hasBias: false,
      confidence: 1.0,
    };
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'system',
            content: `You are analyzing news reporting bias. A news source that supports languages ${sourceSupportedLanguages.join(', ')} has published an article only in ${articleLanguage}. Determine if this represents potential language-based bias (e.g., important news only reported in one language, excluding speakers of other languages). Respond with JSON: {"hasBias": boolean, "biasType": "language_exclusion"|"selective_reporting"|null, "missingLanguages": ["si", "ta"], "confidence": 0.0-1.0, "reasoning": "brief explanation"}`,
          },
          {
            role: 'user',
            content: `Title: "${articleTitle}"\nDescription: "${articleDescription?.substring(0, 300) || ''}"\nPublished in: ${articleLanguage}\nSource supports: ${sourceSupportedLanguages.join(', ')}`,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (content) {
      try {
        const parsed = JSON.parse(content);
        return {
          hasBias: parsed.hasBias || false,
          biasType: parsed.biasType,
          missingLanguages: parsed.missingLanguages || [],
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning,
        };
      } catch {
        // Fallback parsing
        return {
          hasBias: false,
          confidence: 0.5,
        };
      }
    }

    return {
      hasBias: false,
      confidence: 0.5,
    };
  } catch (error) {
    console.error('Bias detection error:', error);
    return {
      hasBias: false,
      confidence: 0.5,
    };
  }
}

