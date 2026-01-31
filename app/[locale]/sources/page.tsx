import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { getSources } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { cn, getBiasBgColor } from '@/lib/utils';
import { getBiasLabel, type Language } from '@/lib/types';
import { getDictionary } from '@/lib/i18n/get-dictionary';

export const revalidate = 3600;

interface SourcesPageProps {
  params: { locale: string };
}

export default async function SourcesPage({ params }: SourcesPageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);
  const sources = await getSources();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{dict.sources.title}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {dict.sources.subtitle}
        </p>
      </div>

      {/* Bias legend */}
      <Card className="p-4 mb-8 bg-gray-50 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Understanding Bias Ratings</h2>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-bias-left" />
            <span>Left-leaning: Opposition/progressive-leaning coverage</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-bias-center" />
            <span>Center: Balanced/neutral coverage</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-bias-right" />
            <span>Right-leaning: Government/conservative-leaning coverage</span>
          </div>
        </div>
      </Card>

      {sources.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">No sources configured yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sources.map((source) => (
            <Link key={source.id} href={`/${locale}/source/${source.slug}`}>
              <Card className="p-6 h-full hover:shadow-lg transition-all duration-200 hover:border-brand-primary/30">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-lg text-gray-900 dark:text-white">{source.name}</h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      {new URL(source.url).hostname}
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-1 rounded-full text-white font-medium',
                    getBiasBgColor(source.bias_score)
                  )}>
                    {getBiasLabel(source.bias_score)}
                  </span>
                </div>

                {source.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {source.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-900 dark:text-white">{source.article_count}</span> articles
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    Factuality: <span className="font-medium text-gray-900 dark:text-white">{source.factuality_score}%</span>
                  </div>
                </div>

                {/* Bias scale visualization */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <div className="relative h-2 bg-gradient-to-r from-bias-left via-bias-center to-bias-right rounded-full">
                    <div 
                      className="absolute w-3 h-3 bg-white dark:bg-gray-900 border-2 border-gray-800 dark:border-white rounded-full top-1/2 -translate-y-1/2"
                      style={{ 
                        left: `${((source.bias_score + 1) / 2) * 100}%`,
                        marginLeft: '-6px'
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <span>Left</span>
                    <span>Center</span>
                    <span>Right</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
