// Shared types for Ground News SL

export type BiasCategory = 'left' | 'center' | 'right';

export interface BiasDistribution {
  left: number;
  center: number;
  right: number;
}

export function getBiasCategory(score: number): BiasCategory {
  if (score < -0.3) return 'left';
  if (score > 0.3) return 'right';
  return 'center';
}

export function getBiasLabel(score: number): string {
  if (score <= -0.6) return 'Far Left';
  if (score <= -0.3) return 'Left';
  if (score < 0.3) return 'Center';
  if (score < 0.6) return 'Right';
  return 'Far Right';
}

export function getBiasPercentage(distribution: BiasDistribution): {
  left: number;
  center: number;
  right: number;
} {
  const total = distribution.left + distribution.center + distribution.right;
  if (total === 0) return { left: 0, center: 100, right: 0 };
  
  return {
    left: Math.round((distribution.left / total) * 100),
    center: Math.round((distribution.center / total) * 100),
    right: Math.round((distribution.right / total) * 100),
  };
}

// Topic categories for Sri Lankan news
export const TOPIC_CATEGORIES = [
  'politics',
  'economy',
  'business',
  'cricket',
  'sports',
  'tourism',
  'education',
  'health',
  'crime',
  'environment',
  'technology',
  'international',
  'entertainment',
] as const;

export type TopicCategory = typeof TOPIC_CATEGORIES[number];
