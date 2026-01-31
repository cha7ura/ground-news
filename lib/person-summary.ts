import { getAIConfig } from '@/lib/ai-config';
import { supabase } from '@/lib/supabase';
import type { Article } from '@/lib/supabase';
import type { Tag } from '@/lib/types';

export async function getOrGeneratePersonSummary(
  tag: Tag,
  articles: Article[]
): Promise<string | null> {
  // Return cached description if substantial
  if (tag.description && tag.description.length > 50) {
    return tag.description;
  }

  if (articles.length === 0) return null;

  const config = getAIConfig();
  if (!config.llm.apiKey) return null;

  // Build context from article titles and summaries
  const articleContext = articles
    .slice(0, 15)
    .map((a, i) => {
      const date = a.published_at
        ? new Date(a.published_at).toLocaleDateString('en-GB')
        : 'unknown date';
      return `${i + 1}. "${a.title}" (${date})\n   ${a.summary || a.excerpt || ''}`;
    })
    .join('\n\n');

  const prompt = `Based on the following Sri Lankan news articles that mention "${tag.name}", write a concise 2-3 paragraph summary about this person. Include their role/position, key activities, and significance in recent news. If unsure about something, do not speculate.

Articles mentioning ${tag.name}:
${articleContext}

Write a factual, encyclopedic summary (150-250 words). Do not use markdown formatting. Do not start with the person's name.`;

  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (summary && summary.length > 30) {
      // Cache in tags.description
      await supabase
        .from('tags')
        .update({
          description: summary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tag.id);

      return summary;
    }
  } catch {
    // LLM failure is non-critical
  }

  return null;
}
