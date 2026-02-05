// LLM client adapter — abstracts OpenRouter vs Ollama differences.
// Handles timeout, response parsing (strip markdown fences, thinking tags), and retries.

import type { LLMClientConfig, LLMOptions } from './types';

export class LLMClient {
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = config;
  }

  /**
   * Send a prompt to the configured LLM provider and return the raw text response.
   */
  async complete(prompt: string, options: LLMOptions = {}): Promise<string> {
    if (this.config.provider === 'ollama') {
      return this.completeOllama(prompt, options);
    }
    return this.completeOpenRouter(prompt, options);
  }

  private async completeOpenRouter(prompt: string, options: LLMOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout ?? 120_000);

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.openrouterKey}`,
        },
        body: JSON.stringify({
          model: this.config.openrouterModel || 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.max_tokens ?? 2000,
        }),
        signal: controller.signal,
      });

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (data.error) throw new Error(data.error.message);
      return this.cleanResponse(data.choices?.[0]?.message?.content?.trim() || '');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async completeOllama(prompt: string, options: LLMOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout ?? 300_000);

    // /no_think prefix suppresses qwen3 chain-of-thought
    const fullPrompt = `/no_think\n${prompt}`;

    try {
      const res = await fetch(`${this.config.ollamaUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.ollamaModel || 'qwen3:1.7b',
          messages: [{ role: 'user', content: fullPrompt }],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.max_tokens ?? 4000,
          ...(options.json_mode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (data.error) throw new Error(data.error.message);
      return this.cleanResponse(data.choices?.[0]?.message?.content?.trim() || '');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Strip thinking tags and markdown code fences from LLM response.
   */
  private cleanResponse(text: string): string {
    if (!text) return '';
    let cleaned = text
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
    cleaned = cleaned
      .replace(/^```json?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();
    return cleaned;
  }
}

/**
 * Parse a JSON string from LLM output, returning null on failure.
 */
export function parseJSON<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
