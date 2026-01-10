// VoiceLibri - Time Formatting Utilities
// Adapted from BookPlayer's TimeParser

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to human readable (e.g., "2h 30m")
 */
export function formatDurationLong(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Format remaining time with negative sign
 */
export function formatRemainingTime(seconds: number): string {
  return `-${formatDuration(seconds)}`;
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max((current / total) * 100, 0), 100);
}

/**
 * Format progress as percentage string
 */
export function formatProgressPercent(current: number, total: number): string {
  return `${Math.round(calculateProgress(current, total))}%`;
}

/**
 * Parse chapter context string (e.g., "Chapter 3 of 12")
 */
export function formatChapterContext(currentIndex: number, totalChapters: number): string {
  return `Chapter ${currentIndex + 1} of ${totalChapters}`;
}

/**
 * Format date to relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 7) {
    return date.toLocaleDateString();
  } else if (diffDays > 1) {
    return `${diffDays} days ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffHours > 1) {
    return `${diffHours} hours ago`;
  } else if (diffHours === 1) {
    return '1 hour ago';
  } else if (diffMins > 1) {
    return `${diffMins} minutes ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Format speed value (e.g., "1.5×")
 */
export function formatSpeed(speed: number): string {
  const formatted = speed % 1 === 0 ? speed.toString() : speed.toFixed(1);
  return `${formatted}×`;
}
