'use client';

import { cn } from '@/lib/utils';
import { TOPIC_CATEGORIES, TopicCategory } from '@/lib/types';

interface TopicFilterProps {
  selected: string | null;
  onChange: (topic: string | null) => void;
  className?: string;
}

const TOPIC_LABELS: Record<TopicCategory, string> = {
  politics: 'Politics',
  economy: 'Economy',
  business: 'Business',
  cricket: 'Cricket',
  sports: 'Sports',
  tourism: 'Tourism',
  education: 'Education',
  health: 'Health',
  crime: 'Crime',
  environment: 'Environment',
  technology: 'Technology',
  international: 'International',
  entertainment: 'Entertainment',
};

export function TopicFilter({ selected, onChange, className }: TopicFilterProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <button
        onClick={() => onChange(null)}
        className={cn(
          'px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
          selected === null
            ? 'bg-brand-primary text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        )}
      >
        All
      </button>
      {TOPIC_CATEGORIES.map((topic) => (
        <button
          key={topic}
          onClick={() => onChange(topic)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
            selected === topic
              ? 'bg-brand-primary text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          {TOPIC_LABELS[topic]}
        </button>
      ))}
    </div>
  );
}
