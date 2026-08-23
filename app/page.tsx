'use client';

import { useEffect, useState } from 'react';
import { Article, Source } from '@/lib/supabase';
import ArticleList from '@/components/ArticleList';
import Header from '@/components/Header';

export default function Home() {
  const [articles, setArticles] = useState<Array<Article & { sources: Source }>>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState({
    source_id: '',
    category: '',
    language: '',
    has_bias: '',
    search: '',
  });
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    fetchSources();
  }, []);

  useEffect(() => {
    fetchArticles(1);
  }, [filters]);

  const fetchSources = async () => {
    try {
      const response = await fetch('/api/sources');
      if (!response.ok) throw new Error('Failed to fetch sources');
      const data = await response.json();
      setSources(data.sources || []);
    } catch (err) {
      console.error('Error fetching sources:', err);
    }
  };

  const fetchArticles = async (pageNum: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '20',
      });

      if (filters.source_id) params.append('source_id', filters.source_id);
      if (filters.category) params.append('category', filters.category);
      if (filters.language) params.append('language', filters.language);
      if (filters.has_bias === 'true') params.append('has_bias', 'true');
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`/api/articles?${params}`);
      if (!response.ok) throw new Error('Failed to fetch articles');
      const data = await response.json();

      if (pageNum === 1) {
        setArticles(data.articles || []);
      } else {
        setArticles((prev) => [...prev, ...(data.articles || [])]);
      }

      setHasMore(data.pagination.page < data.pagination.totalPages);
      setPage(pageNum);
    } catch (err) {
      console.error('Error fetching articles:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchArticles(page + 1);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Sri Lanka News Aggregator</h1>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Search articles..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <select
                value={filters.source_id}
                onChange={(e) => handleFilterChange('source_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Sources</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Language
              </label>
              <select
                value={filters.language}
                onChange={(e) => handleFilterChange('language', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Languages</option>
                <option value="en">English</option>
                <option value="si">Sinhala</option>
                <option value="ta">Tamil</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                placeholder="e.g., Politics"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Show Bias Only
              </label>
              <select
                value={filters.has_bias}
                onChange={(e) => handleFilterChange('has_bias', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Articles</option>
                <option value="true">With Bias</option>
              </select>
            </div>
          </div>
        </div>

        {/* Articles */}
        {loading && articles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading articles...</p>
          </div>
        ) : (
          <>
            <ArticleList articles={articles} />
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
