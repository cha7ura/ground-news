import Link from 'next/link';
import { Plus, Tag as TagIcon } from 'lucide-react';
import { getAllTags } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TagType } from '@/lib/types';

interface AdminTagsPageProps {
  params: { locale: string };
}

export const revalidate = 60;

const TAG_TYPE_COLORS: Record<TagType, string> = {
  person: 'bg-blue-100 text-blue-700',
  organization: 'bg-purple-100 text-purple-700',
  location: 'bg-green-100 text-green-700',
  topic: 'bg-orange-100 text-orange-700',
  event: 'bg-red-100 text-red-700',
  custom: 'bg-gray-100 text-gray-700',
};

export default async function AdminTagsPage({ params }: AdminTagsPageProps) {
  const tags = await getAllTags(200);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tag Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage entity tags for articles. {tags.length} tags total.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        {(['person', 'organization', 'location', 'topic', 'event', 'custom'] as TagType[]).map((type) => {
          const count = tags.filter(t => t.type === type).length;
          return (
            <Card key={type} className="p-3 text-center">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{count}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{type}s</div>
            </Card>
          );
        })}
      </div>

      {/* Tag table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sinhala</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Articles</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {tags.map((tag) => (
                <tr key={tag.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${params.locale}/tag/${tag.slug}`}
                      className="font-medium text-gray-900 dark:text-white hover:text-brand-primary"
                    >
                      {tag.name}
                    </Link>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{tag.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {tag.name_si || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_TYPE_COLORS[tag.type]}`}>
                      {tag.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                    {tag.article_count}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {tag.created_by}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tag.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {tag.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${params.locale}/admin/tags/${tag.id}`}
                      className="text-sm text-brand-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {tags.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <TagIcon className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    No tags created yet. Tags will be auto-generated by the enrichment pipeline.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
