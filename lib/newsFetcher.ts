import { supabaseAdmin, Source, Article } from './supabase';
import { parseRSSFeed, ParsedArticle } from './rssParser';
import { detectLanguage } from './openrouter';
import { detectLanguageBias } from './openrouter';

/**
 * Fetch and process news from all sources
 */
export async function fetchAllNews() {
  // Get all active sources
  const { data: sources, error: sourcesError } = await supabaseAdmin
    .from('sources')
    .select('*');

  if (sourcesError) {
    throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
  }

  if (!sources || sources.length === 0) {
    console.log('No sources configured');
    return { processed: 0, errors: [] };
  }

  const errors: Array<{ source: string; error: string }> = [];
  let totalProcessed = 0;

  // Process each source one by one
  for (const source of sources) {
    try {
      const processed = await fetchNewsFromSource(source);
      totalProcessed += processed;
      console.log(`Processed ${processed} articles from ${source.name}`);
    } catch (error: any) {
      console.error(`Error processing source ${source.name}:`, error);
      errors.push({
        source: source.name,
        error: error.message || 'Unknown error',
      });
    }
  }

  return {
    processed: totalProcessed,
    errors,
  };
}

/**
 * Fetch and process news from a single source
 */
async function fetchNewsFromSource(source: Source): Promise<number> {
  // Parse RSS feed
  const parsedArticles = await parseRSSFeed(source.rss_url, source);

  if (parsedArticles.length === 0) {
    return 0;
  }

  // Get existing article URLs to avoid duplicates
  const { data: existingArticles } = await supabaseAdmin
    .from('articles')
    .select('url')
    .eq('source_id', source.id);

  const existingUrls = new Set(existingArticles?.map((a) => a.url) || []);

  let processed = 0;

  // Process each article
  for (const parsedArticle of parsedArticles) {
    // Skip duplicates
    if (existingUrls.has(parsedArticle.url)) {
      continue;
    }

    try {
      // Detect language
      const textToAnalyze = `${parsedArticle.title} ${parsedArticle.description || ''}`;
      const languageResult = await detectLanguage(textToAnalyze);

      // Insert article
      const { data: article, error: articleError } = await supabaseAdmin
        .from('articles')
        .insert({
          source_id: source.id,
          title: parsedArticle.title,
          description: parsedArticle.description,
          url: parsedArticle.url,
          published_at: parsedArticle.publishedAt.toISOString(),
          author: parsedArticle.author,
          language: languageResult.language,
          image_url: parsedArticle.imageUrl,
        })
        .select()
        .single();

      if (articleError) {
        // Skip if duplicate (race condition)
        if (articleError.code === '23505') {
          continue;
        }
        throw articleError;
      }

      // Check for language bias
      if (source.supported_languages && source.supported_languages.length > 1) {
        const biasResult = await detectLanguageBias(
          source.id,
          parsedArticle.title,
          parsedArticle.description || '',
          languageResult.language,
          source.supported_languages
        );

        if (biasResult.hasBias && biasResult.confidence > 0.6) {
          // Update article with bias flag
          await supabaseAdmin
            .from('articles')
            .update({ has_language_bias: true })
            .eq('id', article.id);

          // Store bias record
          await supabaseAdmin.from('language_bias').insert({
            source_id: source.id,
            article_id: article.id,
            bias_type: biasResult.biasType || 'language_exclusion',
            detected_language: languageResult.language,
            missing_languages: biasResult.missingLanguages || [],
            confidence_score: biasResult.confidence,
            reasoning: biasResult.reasoning,
          });
        }
      }

      processed++;
    } catch (error: any) {
      console.error(`Error processing article ${parsedArticle.url}:`, error);
      // Continue with next article
    }
  }

  return processed;
}

