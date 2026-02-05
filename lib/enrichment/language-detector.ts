// Language detection using Unicode character ranges.
// Sinhala: U+0D80–U+0DFF, Tamil: U+0B80–U+0BFF

import type { DetectedLanguage } from './types';

const SINHALA_RANGE = /[\u0D80-\u0DFF]/g;
const TAMIL_RANGE = /[\u0B80-\u0BFF]/g;

// Threshold: if >15% of characters are in a script, classify as that language
const THRESHOLD = 0.15;

export function detectLanguage(text: string): DetectedLanguage {
  // Use first 1000 chars for speed
  const sample = text.slice(0, 1000);
  const totalChars = sample.replace(/\s/g, '').length;
  if (totalChars === 0) return 'en';

  const sinhalaCount = (sample.match(SINHALA_RANGE) || []).length;
  const tamilCount = (sample.match(TAMIL_RANGE) || []).length;

  const sinhalaRatio = sinhalaCount / totalChars;
  const tamilRatio = tamilCount / totalChars;

  if (sinhalaRatio > THRESHOLD && sinhalaRatio > tamilRatio) return 'si';
  if (tamilRatio > THRESHOLD && tamilRatio > sinhalaRatio) return 'ta';
  return 'en';
}
