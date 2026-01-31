import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Calendar, Newspaper } from 'lucide-react';
import { getSource, getArticlesBySource } from '@/lib/supabase';
import { ArticleCard } from '@/components/article-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, getBiasBgColor, formatRelativeTime } from '@/lib/utils';
import { getBiasLabel, type Language } from '@/lib/types';
import { getDictionary } from '@/lib/i18n/get-dictionary';

interface SourcePageProps {
  params: { slug: string; locale: string };
}

export const revalidate = 300;

export default async function SourcePage({ params }: SourcePageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);
  const source = await getSource(params.slug);

  if (!source) {
    notFound();
  }

  const articles = await getArticlesBySource(source.id, 30);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <Link href={`/${locale}/sources`}>
        <Button variant="ghost" className="mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {dict.sources.all_sources}
        </Button>
      </Link>

      {/* Source header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{source.name}</h1>
            <a 
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:text-brand-primary flex items-center gap-1 mt-1"
            >
              {source.url}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <span className={cn(
            'text-sm px-4 py-2 rounded-full text-white font-medium w-fit',
            getBiasBgColor(source.bias_score)
          )}>
            {getBiasLabel(source.bias_score)} Bias
          </span>
        </div>

        {source.description && (
          <p className="text-gray-600 dark:text-gray-400 mb-6">{source.description}</p>
        )}

        {/* Source stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{source.article_count}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Articles</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{source.factuality_score}%</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Factuality</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="flex justify-center">
              <span className={cn(
                'text-lg font-bold',
                source.bias_score < -0.3 ? 'text-bias-left' :
                source.bias_score > 0.3 ? 'text-bias-right' : 'text-bias-center'
              )}>
                {source.bias_score > 0 ? '+' : ''}{source.bias_score.toFixed(1)}
              </span>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Bias Score</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white uppercase">{source.language}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Language</div>
          </Card>
        </div>

        {/* Bias scale */}
        <Card className="p-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Bias Position</h3>
          <div className="relative h-4 bg-gradient-to-r from-bias-left via-bias-center to-bias-right rounded-full">
            <div 
              className="absolute w-4 h-4 bg-white dark:bg-gray-900 border-2 border-gray-800 dark:border-white rounded-full top-1/2 -translate-y-1/2 shadow-md"
              style={{ 
                left: `${((source.bias_score + 1) / 2) * 100}%`,
                marginLeft: '-8px'
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Far Left</span>
            <span>Left</span>
            <span>Center</span>
            <span>Right</span>
            <span>Far Right</span>
          </div>
        </Card>
      </div>

      {/* Articles from this source */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Newspaper className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recent Articles</h2>
        </div>

        {articles.length === 0 ? (
          <Card className="p-12 text-center">
            <Newspaper className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No articles from this source yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={{ ...article, source }}
                showSource={false}
                locale={locale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
