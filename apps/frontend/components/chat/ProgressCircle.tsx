'use client';

export interface ProgressCircleProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ProgressCircle({ percentage, size = 16, strokeWidth = 3, className }: ProgressCircleProps) {
  const viewBoxSize = 16;
  const center = viewBoxSize / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercentage = Math.max(0, Math.min(100, percentage || 0));
  const progress = clampedPercentage / 100;
  const offset = circumference * (1 - progress);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      fill="none"
      data-component="progress-circle"
      className={className}
      style={{ transform: 'rotate(-90deg)' }}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        data-slot="progress-circle-background"
        strokeWidth={strokeWidth}
        className="stroke-gray-50 dark:stroke-gray-300 stroke-opacity-40 dark:stroke-opacity-30"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        data-slot="progress-circle-progress"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference.toString()}
        strokeDashoffset={offset}
        className="stroke-[var(--md-accent)]"
        style={{ transition: 'stroke-dashoffset 0.35s cubic-bezier(0.65, 0, 0.35, 1)' }}
      />
    </svg>
  );
}
