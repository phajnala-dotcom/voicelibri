/**
 * VoiceLibri - Neumorphism Progress Bar Component
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Reference: scss/neumorphism/components/_progress.scss
 */

interface ProgressBarProps {
  value: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

/**
 * Neumorphism Progress Bar
 * Inset track with raised fill
 */
export function ProgressBar({
  value,
  size = 'md',
  showLabel = false,
  className = '',
}: ProgressBarProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100);

  const sizeClasses = {
    sm: '',
    md: '',
    lg: 'neu-progress-lg',
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between text-xs text-[var(--neu-gray-700)] mb-2">
          <span>Progress</span>
          <span>{Math.round(clampedValue)}%</span>
        </div>
      )}
      <div className={`neu-progress ${sizeClasses[size]}`}>
        <div
          className="neu-progress-bar"
          style={{ width: `${clampedValue}%` }}
          role="progressbar"
          aria-valuenow={clampedValue}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

/**
 * Linear Progress - Thin progress indicator
 * For mini player and loading states
 */
interface LinearProgressProps {
  value: number; // 0-1
  className?: string;
}

export function LinearProgress({ value, className = '' }: LinearProgressProps) {
  const clampedValue = Math.min(Math.max(value, 0), 1);

  return (
    <div 
      className={`
        w-full h-1 
        bg-[var(--neu-gray-400)] 
        rounded-full 
        overflow-hidden
        shadow-[var(--neu-shadow-inset)]
        ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      <div
        className="h-full bg-[var(--neu-secondary)] transition-all duration-200 rounded-full"
        style={{ width: `${clampedValue * 100}%` }}
      />
    </div>
  );
}

/**
 * Circular Progress - For loading states
 * Reference: neumorphism preloader
 */
interface CircularProgressProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CircularProgress({ size = 'md', className = '' }: CircularProgressProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div 
      className={`
        ${sizeClasses[size]}
        rounded-full
        neu-pressed
        flex items-center justify-center
        ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      <div 
        className="w-3/4 h-3/4 rounded-full border-2 border-[var(--neu-gray-400)] border-t-[var(--neu-secondary)] animate-spin"
      />
    </div>
  );
}
