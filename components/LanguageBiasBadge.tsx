import { LanguageBias } from '@/lib/supabase';

interface LanguageBiasBadgeProps {
  bias: LanguageBias;
}

export default function LanguageBiasBadge({ bias }: LanguageBiasBadgeProps) {
  const languageLabels: Record<string, string> = {
    en: 'English',
    si: 'Sinhala',
    ta: 'Tamil',
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-red-700 font-semibold">Language Bias Detected</span>
        <span className="text-xs text-red-600">
          {(bias.confidence_score * 100).toFixed(0)}% confidence
        </span>
      </div>
      <p className="text-sm text-gray-700 mb-2">
        <strong>Type:</strong> {bias.bias_type.replace('_', ' ')}
      </p>
      <p className="text-sm text-gray-700 mb-2">
        <strong>Detected in:</strong> {languageLabels[bias.detected_language] || bias.detected_language}
      </p>
      {bias.missing_languages && bias.missing_languages.length > 0 && (
        <p className="text-sm text-gray-700">
          <strong>Missing languages:</strong>{' '}
          {bias.missing_languages.map((lang) => languageLabels[lang] || lang).join(', ')}
        </p>
      )}
      {bias.reasoning && (
        <p className="text-sm text-gray-600 mt-2 italic">{bias.reasoning}</p>
      )}
    </div>
  );
}

