'use client';

import { useState } from 'react';
import { ArticleCard } from '@/components/article-card';
import { Button } from '@/components/ui/button';
import type { Language } from '@/lib/types';

interface LoadMoreArticlesProps {
  locale: Language;
  initialOffset: number;
  label: string;
}

export function LoadMoreArticles({ locale, initialOffset, label }: LoadMoreArticlesProps) {
  const [articles, setArticles] = useState<any[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles?limit=12&offset=${offset}`);
      const data = await res.json();
      const newArticles = data.articles || [];

      if (newArticles.length < 12) {
        setHasMore(false);
      }

      setArticles((prev) => [...prev, ...newArticles]);
      setOffset((prev) => prev + newArticles.length);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {articles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} locale={locale} />
          ))}
        </div>
      )}
      {hasMore && (
        <div className="text-center mt-6">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
            className="px-6"
          >
            {loading ? '...' : label}
          </Button>
        </div>
      )}
    </>
  );
}
