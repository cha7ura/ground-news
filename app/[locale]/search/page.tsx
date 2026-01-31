'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Newspaper, Clock, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatRelativeTime, cn, getBiasColor } from '@/lib/utils';

interface ArticleHit {
  id: string;
  title: string;
  summary: string | null;
  excerpt: string | null;
  image_url: string | null;
  published_at: string;
  topics: string[];
  ai_bias_score: number | null;
  ai_sentiment: string | null;
  url: string;
}

interface StoryHit {
  id: string;
  title: string;
  summary: string | null;
  primary_topic: string | null;
  image_url: string | null;
  article_count: number;
  source_count: number;
  bias_distribution: { left: number; center: number; right: number };
  last_updated_at: string;
}

type SearchType = 'articles' | 'stories';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchType>('articles');
  const [articles, setArticles] = useState<ArticleHit[]>([]);
  const [stories, setStories] = useState<StoryHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q: string, t: SearchType) => {
    if (!q.trim()) {
      setArticles([]);
      setStories([]);
      setTotalHits(0);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${t}&limit=20`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      if (t === 'stories') {
        setStories(data.hits || []);
        setArticles([]);
      } else {
        setArticles(data.hits || []);
        setStories([]);
      }
      setTotalHits(data.estimatedTotalHits || data.totalHits || 0);
    } catch {
      setArticles([]);
      setStories([]);
      setTotalHits(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      doSearch(query, type);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, type, doSearch]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Search</h1>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles and stories..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent text-lg"
            autoFocus
          />
        </div>

        {/* Type tabs */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setType('articles')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-full transition-colors',
              type === 'articles'
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            Articles
          </button>
          <button
            onClick={() => setType('stories')}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-full transition-colors',
              type === 'stories'
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            Stories
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="flex gap-4">
                <div className="w-24 h-20 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                  <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && searched && (
        <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {totalHits} result{totalHits !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Article results */}
      {!loading && type === 'articles' && articles.length > 0 && (
        <div className="space-y-3">
          {articles.map((article) => (
            <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer">
              <Card className="p-4 hover:shadow-md transition-all duration-200 hover:border-brand-primary/30 group">
                <div className="flex gap-4">
                  {article.image_url && (
                    <div className="relative w-24 h-20 flex-shrink-0 rounded-lg overflow-hidden">
                      <Image
                        src={article.image_url}
                        alt={article.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {article.topics?.[0] && (
                      <span className="text-xs font-medium text-brand-primary uppercase">
                        {article.topics[0]}
                      </span>
                    )}
                    <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-brand-primary transition-colors">
                      {article.title}
                    </h3>
                    {article.summary && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-1">
                        {article.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{formatRelativeTime(article.published_at)}</span>
                      {article.ai_sentiment && (
                        <span className="capitalize">{article.ai_sentiment}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </a>
          ))}
        </div>
      )}

      {/* Story results */}
      {!loading && type === 'stories' && stories.length > 0 && (
        <div className="space-y-3">
          {stories.map((story) => (
            <Link key={story.id} href={`/story/${story.id}`}>
              <Card className="p-4 hover:shadow-md transition-all duration-200 hover:border-brand-primary/30 group">
                <div className="flex gap-4">
                  {story.image_url && (
                    <div className="relative w-24 h-20 flex-shrink-0 rounded-lg overflow-hidden">
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
                    {story.primary_topic && (
                      <span className="text-xs font-medium text-brand-primary uppercase">
                        {story.primary_topic}
                      </span>
                    )}
                    <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-brand-primary transition-colors">
                      {story.title}
                    </h3>
                    {story.summary && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-1">
                        {story.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{story.source_count} sources</span>
                      <span>{story.article_count} articles</span>
                      <span>{formatRelativeTime(story.last_updated_at)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && articles.length === 0 && stories.length === 0 && (
        <Card className="p-12 text-center">
          <Newspaper className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">No results found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Try a different search term or switch between articles and stories.
          </p>
        </Card>
      )}

      {/* Initial state */}
      {!loading && !searched && (
        <Card className="p-12 text-center">
          <Search className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">Search news</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Search across articles and stories from Sri Lankan news sources.
          </p>
        </Card>
      )}
    </div>
  );
}
