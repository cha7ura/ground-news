import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { EyeOff, AlertTriangle, ArrowRight, Clock, Newspaper } from 'lucide-react';
import { getBlindspotStories } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { BlindspotBadge, BlindspotCoverageBar } from '@/components/blindspot-badge';
import { BiasIndicator } from '@/components/bias-indicator';
import { formatRelativeTime, cn } from '@/lib/utils';
import { getBiasPercentage, getLocalizedTitle, type Language } from '@/lib/types';
import { getDictionary } from '@/lib/i18n/get-dictionary';

export const revalidate = 300;

async function BlindspotStories({ type }: { type?: 'left' | 'right' }) {
  const stories = await getBlindspotStories(20, type);

  if (stories.length === 0) {
    return (
      <Card className="p-12 text-center">
        <EyeOff className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No blindspots found</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {type 
            ? `No stories with missing ${type}-leaning coverage found.`
            : 'All current stories have coverage from across the political spectrum.'
          }
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {stories.map((story) => {
        const percentages = getBiasPercentage(story.bias_distribution);
        
        return (
          <Link key={story.id} href={`/story/${story.id}`}>
            <Card className="p-4 hover:shadow-lg transition-all duration-200 hover:border-amber-300 group">
              <div className="flex gap-4">
                {/* Image */}
                {story.image_url && (
                  <div className="relative w-32 h-24 flex-shrink-0 rounded-lg overflow-hidden">
                    <Image
                      src={story.image_url}
                      alt={story.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {/* Blindspot badge */}
                  <div className="flex items-center justify-between mb-2">
                    <BlindspotBadge type={story.blindspot_type} size="sm" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(story.last_updated_at)}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2 line-clamp-2 group-hover:text-brand-primary transition-colors">
                    {story.title}
                  </h3>

                  {/* Bias bar with percentages */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                        {percentages.left > 0 && (
                          <div 
                            className="bg-bias-left"
                            style={{ width: `${percentages.left}%` }}
                          />
                        )}
                        {percentages.center > 0 && (
                          <div 
                            className="bg-bias-center"
                            style={{ width: `${percentages.center}%` }}
                          />
                        )}
                        {percentages.right > 0 && (
                          <div 
                            className="bg-bias-right"
                            style={{ width: `${percentages.right}%` }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className={cn(
                        percentages.left > 0 ? 'text-bias-left' : 'text-gray-400 dark:text-gray-500'
                      )}>
                        L {percentages.left}%
                      </span>
                      <span className="text-bias-center">
                        C {percentages.center}%
                      </span>
                      <span className={cn(
                        percentages.right > 0 ? 'text-bias-right' : 'text-gray-400 dark:text-gray-500'
                      )}>
                        R {percentages.right}%
                      </span>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{story.source_count} sources</span>
                    <span>{story.article_count} articles</span>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function BlindspotsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-4 animate-pulse">
          <div className="flex gap-4">
            <div className="w-32 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="flex-1">
              <div className="h-5 w-32 bg-amber-100 dark:bg-amber-900/30 rounded-full mb-2" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
              <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

interface BlindspotPageProps {
  params: { locale: string };
}

export default async function BlindspotPage({ params }: BlindspotPageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <EyeOff className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Blindspot</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Stories with coverage gaps</p>
          </div>
        </div>

        <Card className="p-4 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-medium text-amber-900 dark:text-amber-200 mb-1">What are Blindspots?</h2>
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Blindspots are stories that are disproportionately covered by one side of the 
                political spectrum. These stories may be underreported by left-leaning or 
                right-leaning sources, giving you an incomplete picture. Understanding blindspots 
                helps you see what you might be missing.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        <Link 
          href="/blindspots"
          className="px-4 py-2 text-sm font-medium bg-brand-primary text-white rounded-full"
        >
          All Blindspots
        </Link>
        <Link 
          href="/blindspots?type=left"
          className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full flex items-center gap-1"
        >
          <span className="w-2 h-2 rounded-full bg-bias-left" />
          No Left Coverage
        </Link>
        <Link 
          href="/blindspots?type=right"
          className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full flex items-center gap-1"
        >
          <span className="w-2 h-2 rounded-full bg-bias-right" />
          No Right Coverage
        </Link>
      </div>

      {/* Blindspot stories */}
      <Suspense fallback={<BlindspotsSkeleton />}>
        <BlindspotStories />
      </Suspense>

      {/* Newsletter signup */}
      <Card className="p-6 mt-8 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EyeOff className="h-8 w-8 text-amber-600" />
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Blindspot Report</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Get weekly blindspot updates delivered to your inbox
              </p>
            </div>
          </div>
          <button className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors">
            Subscribe
          </button>
        </div>
      </Card>
    </div>
  );
}
