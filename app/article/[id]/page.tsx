import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import LanguageBiasBadge from '@/components/LanguageBiasBadge';
import { Article, Source, LanguageBias, supabaseAdmin } from '@/lib/supabase';

async function getArticle(id: string) {
  try {
    // Get article with source info
    const { data: article, error: articleError } = await supabaseAdmin
      .from('articles')
      .select(`
        *,
        sources (
          id,
          name,
          website_url,
          supported_languages
        )
      `)
      .eq('id', id)
      .single();

    if (articleError || !article) {
      return null;
    }

    // Get bias information if exists
    let bias: LanguageBias | null = null;
    if (article.has_language_bias) {
      const { data: biasData } = await supabaseAdmin
        .from('language_bias')
        .select('*')
        .eq('article_id', id)
        .single();

      bias = biasData;
    }

    return { article, bias };
  } catch (error) {
    console.error('Error fetching article:', error);
    return null;
  }
}

export default async function ArticlePage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getArticle(params.id);

  if (!data || !data.article) {
    notFound();
  }

  const article = data.article as Article & { sources: Source };
  const bias: LanguageBias | null = data.bias;
  const source = article.sources as Source;

  const publishedDate = new Date(article.published_at);
  const languageLabels: Record<string, string> = {
    en: 'English',
    si: 'Sinhala',
    ta: 'Tamil',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
        >
          ← Back to News Feed
        </Link>

        <article className="bg-white rounded-lg shadow-md overflow-hidden">
          {article.image_url && (
            <div className="relative w-full h-64 md:h-96 bg-gray-200">
              <Image
                src={article.image_url}
                alt={article.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 896px"
              />
            </div>
          )}

          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-blue-600">
                  {source.name}
                </span>
                <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600">
                  {languageLabels[article.language] || article.language}
                </span>
                {article.has_language_bias && (
                  <span className="text-xs px-2 py-1 bg-red-100 rounded text-red-700">
                    Language Bias Detected
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {publishedDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {article.title}
            </h1>

            {article.description && (
              <p className="text-lg text-gray-700 mb-6 leading-relaxed">
                {article.description}
              </p>
            )}

            {bias && (
              <div className="mb-6">
                <LanguageBiasBadge bias={bias} />
              </div>
            )}

            {article.content && (
              <div
                className="prose max-w-none mb-6"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            )}

            <div className="border-t border-gray-200 pt-6 mt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Source</p>
                  <a
                    href={source.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {source.name}
                  </a>
                </div>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Read Original Article →
                </a>
              </div>

              {article.category && (
                <div className="mt-4">
                  <span className="text-sm text-gray-600">Category: </span>
                  <span className="text-sm px-2 py-1 bg-gray-100 rounded">
                    {article.category}
                  </span>
                </div>
              )}

              {article.author && (
                <div className="mt-2">
                  <span className="text-sm text-gray-600">Author: </span>
                  <span className="text-sm text-gray-900">{article.author}</span>
                </div>
              )}
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}

