'use client';

import { useState } from 'react';
import { Source } from '@/lib/supabase';

interface SourceFormProps {
  source?: Source;
  onSave: () => void;
  onCancel: () => void;
}

export default function SourceForm({ source, onSave, onCancel }: SourceFormProps) {
  const [formData, setFormData] = useState({
    name: source?.name || '',
    rss_url: source?.rss_url || '',
    website_url: source?.website_url || '',
    supported_languages: source?.supported_languages || ['en'],
    category: source?.category || '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const url = source
        ? `/api/sources/${source.id}`
        : '/api/sources';
      const method = source ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save source');
      }

      onSave();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLanguage = (lang: string) => {
    setFormData((prev) => ({
      ...prev,
      supported_languages: prev.supported_languages.includes(lang)
        ? prev.supported_languages.filter((l) => l !== lang)
        : [...prev.supported_languages, lang],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Source Name *
        </label>
        <input
          type="text"
          id="name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="rss_url" className="block text-sm font-medium text-gray-700 mb-1">
          RSS Feed URL *
        </label>
        <input
          type="url"
          id="rss_url"
          required
          value={formData.rss_url}
          onChange={(e) => setFormData({ ...formData, rss_url: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="website_url" className="block text-sm font-medium text-gray-700 mb-1">
          Website URL *
        </label>
        <input
          type="url"
          id="website_url"
          required
          value={formData.website_url}
          onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Supported Languages *
        </label>
        <div className="flex gap-4">
          {['en', 'si', 'ta'].map((lang) => (
            <label key={lang} className="flex items-center">
              <input
                type="checkbox"
                checked={formData.supported_languages.includes(lang)}
                onChange={() => toggleLanguage(lang)}
                className="mr-2"
              />
              <span className="text-sm">
                {lang === 'en' ? 'English' : lang === 'si' ? 'Sinhala' : 'Tamil'}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
          Category (optional)
        </label>
        <input
          type="text"
          id="category"
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., Politics, Economy, Sports"
        />
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving...' : source ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

