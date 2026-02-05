import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Tag as TagIcon, Newspaper, User, MapPin, AlertTriangle } from 'lucide-react';
import {
  getTagBySlug,
  getArticlesByTag,
  getStoriesByTag,
  getRelatedTags,
  getTagMapData,
  isCrimeTag,
  isIncidentTag,
} from '@/lib/supabase';
import { ArticleCard } from '@/components/article-card';
import { StoryCard } from '@/components/story-card';
import { PersonTimeline } from '@/components/person-timeline';
import { IncidentMap } from '@/components/incident-map';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { getLocalizedTagName, type Language, type TagType } from '@/lib/types';
import { getOrGeneratePersonSummary } from '@/lib/person-summary';

interface TagPageProps {
  params: { slug: string; locale: string };
}

export const revalidate = 300;

const TAG_TYPE_COLORS: Record<TagType, string> = {
  person: 'bg-blue-100 text-blue-700',
  organization: 'bg-purple-100 text-purple-700',
  location: 'bg-green-100 text-green-700',
  topic: 'bg-orange-100 text-orange-700',
  event: 'bg-red-100 text-red-700',
  custom: 'bg-gray-100 text-gray-700',
};

const TAG_TYPE_LABELS: Record<Language, Record<TagType, string>> = {
  en: {
    person: 'Person',
    organization: 'Organization',
    location: 'Location',
    topic: 'Topic',
    event: 'Event',
    custom: 'Tag',
  },
  si: {
    person: 'පුද්ගලයා',
    organization: 'සංවිධානය',
    location: 'ස්ථානය',
    topic: 'මාතෘකාව',
    event: 'සිද්ධිය',
    custom: 'ටැගය',
  },
};

export default async function TagPage({ params }: TagPageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);

  const tag = await getTagBySlug(params.slug);

  if (!tag) {
    notFound();
  }

  const isPerson = tag.type === 'person';
  const isCrime = isCrimeTag(tag.slug);
  const isIncident = isIncidentTag(tag.slug);

  const [articles, stories, relatedTags, mapData] = await Promise.all([
    getArticlesByTag(params.slug, isPerson ? 50 : isIncident ? 100 : 20),
    getStoriesByTag(params.slug, 5),
    getRelatedTags(tag.id, 10),
    isIncident ? getTagMapData(params.slug) : Promise.resolve([]),
  ]);

  // Generate AI summary for person tags
  const personSummary = isPerson
    ? await getOrGeneratePersonSummary(tag, articles)
    : null;

  const tagName = getLocalizedTagName(tag, locale);
  const typeLabel = TAG_TYPE_LABELS[locale][tag.type];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back button */}
      <Link href={`/${locale}`}>
        <Button variant="ghost" className="mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {dict.story.back}
        </Button>
      </Link>

      {/* Tag header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg ${isCrime ? 'bg-red-100 dark:bg-red-900/30' : 'bg-brand-primary/10'}`}>
            {isPerson ? (
              <User className="h-6 w-6 text-brand-primary" />
            ) : isCrime ? (
              <AlertTriangle className="h-6 w-6 text-red-600" />
            ) : tag.type === 'location' ? (
              <MapPin className="h-6 w-6 text-brand-primary" />
            ) : (
              <TagIcon className="h-6 w-6 text-brand-primary" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                {tagName}
              </h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isCrime ? 'bg-red-100 text-red-700' : TAG_TYPE_COLORS[tag.type]}`}>
                {isCrime ? (locale === 'si' ? 'අපරාධ' : 'Crime') : typeLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Person summary or tag description */}
        {(personSummary || tag.description) && (
          <p className="text-gray-600 dark:text-gray-400 mt-2 leading-relaxed max-w-3xl">
            {personSummary || (locale === 'si' && tag.description_si ? tag.description_si : tag.description)}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-4">
          <span className="flex items-center gap-1">
            <Newspaper className="h-4 w-4" />
            {tag.article_count} {dict.common.articles}
          </span>
          {isIncident && mapData.length > 0 && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {new Set(mapData.map(d => d.location_tag_name)).size} {locale === 'si' ? 'ස්ථාන' : 'locations'}
            </span>
          )}
        </div>
      </div>

      {/* Incident Map (crime tags + police/army) */}
      {isIncident && mapData.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            {locale === 'si' ? 'සිද්ධි සිතියම' : 'Incident Map'}
          </h2>
          <IncidentMap incidents={mapData} />
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Related stories */}
          {stories.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{dict.tags.related_stories}</h2>
              <div className="space-y-4">
                {stories.map((story) => (
                  <StoryCard key={story.id} story={story} variant="compact" locale={locale} />
                ))}
              </div>
            </section>
          )}

          {/* Person timeline, Crime timeline, or article grid */}
          {isPerson && articles.length > 0 ? (
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {dict.tags.timeline || 'Timeline'}
              </h2>
              <PersonTimeline articles={articles} locale={locale} />
            </section>
          ) : isIncident && articles.length > 0 ? (
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {locale === 'si' ? 'කාල රේඛාව' : 'Timeline'} ({articles.length})
              </h2>
              <PersonTimeline articles={articles} locale={locale} showCasualties />
            </section>
          ) : (
            <section>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {dict.tags.all_articles} ({articles.length})
              </h2>
              {articles.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {articles.map((article) => (
                    <ArticleCard key={article.id} article={article} locale={locale} />
                  ))}
                </div>
              ) : (
                <Card className="p-12 text-center">
                  <Newspaper className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {locale === 'si' ? 'මෙම ටැගය සමඟ ලිපි නැත.' : 'No articles with this tag yet.'}
                  </p>
                </Card>
              )}
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* District breakdown for incident tags */}
          {isIncident && mapData.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                {locale === 'si' ? 'දිස්ත්‍රික් බෙදීම' : 'By District'}
              </h3>
              <div className="space-y-2">
                {(() => {
                  const districtCounts: Record<string, number> = {};
                  for (const inc of mapData) {
                    if (inc.district) {
                      districtCounts[inc.district] = (districtCounts[inc.district] || 0) + 1;
                    }
                  }
                  return Object.entries(districtCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 10)
                    .map(([district, count]) => (
                      <div key={district} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{district}</span>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">{count}</span>
                      </div>
                    ));
                })()}
              </div>
            </Card>
          )}

          {/* Related tags */}
          {relatedTags.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{dict.tags.related_tags}</h3>
              <div className="flex flex-wrap gap-2">
                {relatedTags.map((relTag) => (
                  <Link
                    key={relTag.id}
                    href={`/${locale}/tag/${relTag.slug}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-brand-primary/10 hover:text-brand-primary text-gray-700 dark:text-gray-300 rounded-full text-sm transition-colors"
                  >
                    <span>{getLocalizedTagName(relTag, locale)}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">({relTag.article_count})</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
