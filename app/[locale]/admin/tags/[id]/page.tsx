'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import type { Tag, TagType } from '@/lib/types';

const TAG_TYPES: TagType[] = ['person', 'organization', 'location', 'topic', 'event', 'custom'];

export default function EditTagPage() {
  const params = useParams();
  const router = useRouter();
  const tagId = params.id as string;
  const locale = params.locale as string;

  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [nameSi, setNameSi] = useState('');
  const [type, setType] = useState<TagType>('custom');
  const [description, setDescription] = useState('');
  const [descriptionSi, setDescriptionSi] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    async function loadTag() {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('id', tagId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setTag(data);
      setName(data.name);
      setNameSi(data.name_si || '');
      setType(data.type);
      setDescription(data.description || '');
      setDescriptionSi(data.description_si || '');
      setIsActive(data.is_active);
      setLoading(false);
    }

    loadTag();
  }, [tagId]);

  async function handleSave() {
    setSaving(true);

    const { error } = await supabase
      .from('tags')
      .update({
        name,
        name_si: nameSi || null,
        type,
        description: description || null,
        description_si: descriptionSi || null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tagId);

    setSaving(false);

    if (!error) {
      router.push(`/${locale}/admin/tags`);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!tag) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Tag not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href={`/${locale}/admin/tags`}>
        <Button variant="ghost" className="mb-6 -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to tags
        </Button>
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Edit Tag</h1>

      <Card className="p-6 space-y-6">
        {/* Name (English) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name (English)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
          />
        </div>

        {/* Name (Sinhala) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name (Sinhala)</label>
          <input
            type="text"
            value={nameSi}
            onChange={(e) => setNameSi(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent font-sinhala"
            placeholder="සිංහල නම"
          />
        </div>

        {/* Slug (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
          <input
            type="text"
            value={tag.slug}
            readOnly
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TagType)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
          >
            {TAG_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Description (English) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (English)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent"
          />
        </div>

        {/* Description (Sinhala) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Sinhala)</label>
          <textarea
            value={descriptionSi}
            onChange={(e) => setDescriptionSi(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-brand-primary focus:border-transparent font-sinhala"
          />
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 text-brand-primary rounded focus:ring-brand-primary"
          />
          <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
            Active (visible in tag pages and search)
          </label>
        </div>

        {/* Stats */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400">
          <p>Articles: {tag.article_count}</p>
          <p>Created by: {tag.created_by}</p>
          <p>Created: {new Date(tag.created_at).toLocaleDateString()}</p>
        </div>

        {/* Save */}
        <div className="flex gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Link href={`/${locale}/admin/tags`}>
            <Button variant="outline">Cancel</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
