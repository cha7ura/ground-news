'use client';

import { AlertTriangle, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type BlindspotType = 'left' | 'right' | 'both' | 'none' | null;

interface BlindspotBadgeProps {
  type: BlindspotType;
  severity?: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BlindspotBadge({ 
  type, 
  severity = 0,
  showLabel = true,
  size = 'md',
  className 
}: BlindspotBadgeProps) {
  if (!type || type === 'none' || type === 'both') {
    return null;
  }

  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const label = type === 'left' 
    ? 'No coverage from Left Sources' 
    : 'No coverage from Right Sources';

  const shortLabel = type === 'left' 
    ? 'Left Blindspot' 
    : 'Right Blindspot';

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700',
      sizes[size],
      className
    )}>
      <EyeOff className={iconSizes[size]} />
      {showLabel && (
        <span>{size === 'sm' ? shortLabel : label}</span>
      )}
    </div>
  );
}

// Compact inline version for story cards
export function BlindspotIndicator({ 
  type,
  className 
}: { 
  type: BlindspotType;
  className?: string;
}) {
  if (!type || type === 'none' || type === 'both') {
    return null;
  }

  return (
    <div className={cn(
      'flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400',
      className
    )}>
      <EyeOff className="h-3 w-3" />
      <span>
        {type === 'left' ? 'No Left' : 'No Right'} coverage
      </span>
    </div>
  );
}

// Full blindspot card for blindspot feed
interface BlindspotCardProps {
  type: BlindspotType;
  leftPercentage: number;
  centerPercentage: number;
  rightPercentage: number;
  timeAgo: string;
  className?: string;
}

export function BlindspotCoverageBar({
  type,
  leftPercentage,
  centerPercentage,
  rightPercentage,
  timeAgo,
  className
}: BlindspotCardProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Blindspot badge */}
      <div className="flex items-center justify-between">
        <BlindspotBadge type={type} size="sm" />
        <span className="text-xs text-gray-500 dark:text-gray-400">{timeAgo}</span>
      </div>

      {/* Coverage bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
        {leftPercentage > 0 && (
          <div 
            className="bg-bias-left"
            style={{ width: `${leftPercentage}%` }}
          />
        )}
        {centerPercentage > 0 && (
          <div 
            className="bg-bias-center"
            style={{ width: `${centerPercentage}%` }}
          />
        )}
        {rightPercentage > 0 && (
          <div 
            className="bg-bias-right"
            style={{ width: `${rightPercentage}%` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs">
        <span className={cn(
          leftPercentage > 0 ? 'text-bias-left font-medium' : 'text-gray-400 dark:text-gray-500'
        )}>
          {leftPercentage > 0 ? `Left ${leftPercentage}%` : 'L 0%'}
        </span>
        <span className={cn(
          centerPercentage > 0 ? 'text-bias-center font-medium' : 'text-gray-400 dark:text-gray-500'
        )}>
          Center {centerPercentage}%
        </span>
        <span className={cn(
          rightPercentage > 0 ? 'text-bias-right font-medium' : 'text-gray-400 dark:text-gray-500'
        )}>
          {rightPercentage > 0 ? `Right ${rightPercentage}%` : 'R 0%'}
        </span>
      </div>
    </div>
  );
}
