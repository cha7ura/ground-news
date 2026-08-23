import Link from 'next/link';
import Image from 'next/image';
import { Article, Source } from '@/lib/supabase';

interface ArticleCardProps {
  article: Article & { sources: Source };
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const source = article.sources;
  const publishedDate = new Date(article.published_at);
  const languageLabels: Record<string, string> = {
    en: 'English',
    si: 'Sinhala',
    ta: 'Tamil',
  };

  return (
    <Link
      href={`/article/${article.id}`}
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 overflow-hidden"
    >
      {article.image_url && (
        <div className="relative w-full h-48 bg-gray-200">
          <Image
            src={article.image_url}
            alt={article.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-blue-600">
            {source.name}
          </span>
          <div className="flex gap-2">
            <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600">
              {languageLabels[article.language] || article.language}
            </span>
            {article.has_language_bias && (
              <span className="text-xs px-2 py-1 bg-red-100 rounded text-red-700">
                Bias
              </span>
            )}
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {article.title}
        </h3>
        {article.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-3">
            {article.description}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{publishedDate.toLocaleDateString()}</span>
          {article.category && (
            <span className="px-2 py-1 bg-gray-100 rounded">
              {article.category}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

