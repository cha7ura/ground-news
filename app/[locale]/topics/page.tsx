import { Suspense } from 'react';
import Link from 'next/link';
import {
  Building2, Banknote, Briefcase, Trophy, Plane,
  GraduationCap, Heart, Shield, Leaf, Cpu, Globe,
  Film, CircleDot, Tag, User, MapPin
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getPopularTags } from '@/lib/supabase';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { TOPIC_CATEGORIES, type TopicCategory, type Language, type TagType, getLocalizedTagName } from '@/lib/types';

export const revalidate = 300;

const TOPIC_ICONS: Record<TopicCategory, React.ReactNode> = {
  politics: <Building2 className="h-6 w-6" />,
  economy: <Banknote className="h-6 w-6" />,
  business: <Briefcase className="h-6 w-6" />,
  cricket: <CircleDot className="h-6 w-6" />,
  sports: <Trophy className="h-6 w-6" />,
  tourism: <Plane className="h-6 w-6" />,
  education: <GraduationCap className="h-6 w-6" />,
  health: <Heart className="h-6 w-6" />,
  crime: <Shield className="h-6 w-6" />,
  environment: <Leaf className="h-6 w-6" />,
  technology: <Cpu className="h-6 w-6" />,
  international: <Globe className="h-6 w-6" />,
  entertainment: <Film className="h-6 w-6" />,
};

const TAG_TYPE_ICONS: Record<TagType, React.ReactNode> = {
  person: <User className="h-4 w-4" />,
  organization: <Building2 className="h-4 w-4" />,
  location: <MapPin className="h-4 w-4" />,
  topic: <Tag className="h-4 w-4" />,
  event: <Tag className="h-4 w-4" />,
  custom: <Tag className="h-4 w-4" />,
};

const TAG_TYPE_LABELS: Record<TagType, string> = {
  person: 'People',
  organization: 'Organizations',
  location: 'Locations',
  topic: 'Topics',
  event: 'Events',
  custom: 'Other',
};

async function PopularEntities({ locale }: { locale: Language }) {
  const tags = await getPopularTags(20);

  if (tags.length === 0) return null;

  // Group by type
  const grouped = tags.reduce((acc, tag) => {
    if (!acc[tag.type]) acc[tag.type] = [];
    acc[tag.type].push(tag);
    return acc;
  }, {} as Record<string, typeof tags>);

  const typeOrder: TagType[] = ['person', 'organization', 'location', 'topic'];

  return (
    <div className="space-y-6">
      {typeOrder.map((type) => {
        const typeTags = grouped[type];
        if (!typeTags || typeTags.length === 0) return null;

        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-500 dark:text-gray-400">{TAG_TYPE_ICONS[type]}</span>
              <h3 className="font-semibold text-gray-900 dark:text-white">{TAG_TYPE_LABELS[type]}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {typeTags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/${locale}/tag/${tag.slug}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-brand-primary/10 hover:text-brand-primary transition-colors"
                >
                  {getLocalizedTagName(tag, locale)}
                  {tag.article_count > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {tag.article_count}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TopicsPageProps {
  params: { locale: string };
}

export default async function TopicsPage({ params }: TopicsPageProps) {
  const locale = (params.locale === 'si' ? 'si' : 'en') as Language;
  const dict = await getDictionary(locale);

  const topicNames = dict.topic_names as Record<string, string>;
  const topicDescs = dict.topic_descriptions as Record<string, string>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{dict.topics.title}</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {dict.topics.subtitle}
        </p>
      </div>

      {/* Topic category grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {TOPIC_CATEGORIES.map((topic) => (
          <Link key={topic} href={`/${locale}/search?q=${encodeURIComponent(topicNames[topic] || topic)}&type=stories`}>
            <Card className="p-5 hover:shadow-lg transition-all duration-200 hover:border-brand-primary/30 cursor-pointer group">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl group-hover:bg-brand-primary group-hover:text-white transition-colors">
                  {TOPIC_ICONS[topic]}
                </div>
                <div className="flex-1">
                  <h2 className="font-bold text-lg text-gray-900 dark:text-white mb-1 group-hover:text-brand-primary transition-colors">
                    {topicNames[topic] || topic}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {topicDescs[topic]}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Popular entities from tags */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{dict.tags.popular_tags}</h2>
        <Suspense fallback={
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        }>
          <PopularEntities locale={locale} />
        </Suspense>
      </div>

      <Card className="p-6 bg-gray-50 dark:bg-gray-900">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{dict.topics.how_topics_work}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {dict.topics.how_topics_desc}
        </p>
      </Card>
    </div>
  );
}
