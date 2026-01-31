'use client';

import { cn } from '@/lib/utils';
import { BiasDistribution, getBiasPercentage } from '@/lib/types';

interface BiasIndicatorProps {
  distribution: BiasDistribution;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BiasIndicator({ 
  distribution, 
  showLabels = true,
  size = 'md',
  className 
}: BiasIndicatorProps) {
  const percentages = getBiasPercentage(distribution);
  const total = distribution.left + distribution.center + distribution.right;

  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  if (total === 0) {
    return (
      <div className={cn('w-full', className)}>
        <div className={cn('rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden', heights[size])}>
          <div className="h-full w-full bg-gray-300 dark:bg-gray-600" />
        </div>
        {showLabels && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">No coverage data</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Bias bar */}
      <div className={cn('rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex', heights[size])}>
        {percentages.left > 0 && (
          <div 
            className="h-full bg-bias-left transition-all duration-300"
            style={{ width: `${percentages.left}%` }}
          />
        )}
        {percentages.center > 0 && (
          <div 
            className="h-full bg-bias-center transition-all duration-300"
            style={{ width: `${percentages.center}%` }}
          />
        )}
        {percentages.right > 0 && (
          <div 
            className="h-full bg-bias-right transition-all duration-300"
            style={{ width: `${percentages.right}%` }}
          />
        )}
      </div>

      {/* Labels */}
      {showLabels && (
        <div className="flex justify-between text-xs mt-1.5">
          <span className={cn(
            'flex items-center gap-1',
            percentages.left > 0 ? 'text-bias-left' : 'text-gray-400 dark:text-gray-500'
          )}>
            <span className="w-2 h-2 rounded-full bg-bias-left" />
            {percentages.left}%
          </span>
          <span className={cn(
            'flex items-center gap-1',
            percentages.center > 0 ? 'text-bias-center' : 'text-gray-400 dark:text-gray-500'
          )}>
            <span className="w-2 h-2 rounded-full bg-bias-center" />
            {percentages.center}%
          </span>
          <span className={cn(
            'flex items-center gap-1',
            percentages.right > 0 ? 'text-bias-right' : 'text-gray-400 dark:text-gray-500'
          )}>
            <span className="w-2 h-2 rounded-full bg-bias-right" />
            {percentages.right}%
          </span>
        </div>
      )}
    </div>
  );
}

// Compact version for inline use
export function BiasIndicatorCompact({ 
  distribution,
  className 
}: { 
  distribution: BiasDistribution;
  className?: string;
}) {
  const percentages = getBiasPercentage(distribution);
  
  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <div className="flex h-1.5 w-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
        {percentages.left > 0 && (
          <div 
            className="h-full bg-bias-left"
            style={{ width: `${percentages.left}%` }}
          />
        )}
        {percentages.center > 0 && (
          <div 
            className="h-full bg-bias-center"
            style={{ width: `${percentages.center}%` }}
          />
        )}
        {percentages.right > 0 && (
          <div 
            className="h-full bg-bias-right"
            style={{ width: `${percentages.right}%` }}
          />
        )}
      </div>
    </div>
  );
}
