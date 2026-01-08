# VoiceLibri Development Manual - Part 4: Design System

> **Purpose:** Complete UI/UX design specification for LLM coding agents  
> **Aligned with:** MOBILE_APP_DEVELOPMENT_GUIDE.md Section 8  
> **Audience:** Claude Opus 4.5 (Supervisor), GPT 5.1 Codex Max (Implementation)  
> **Last Updated:** January 7, 2026

---

## 1. Design Philosophy

VoiceLibri uses a **premium dark mode aesthetic** with carefully crafted gradients, glass morphism effects, and fluid animations. The design should feel like a high-end music streaming app.

**Core Principles:**
- Dark-first design (no light mode in MVP)
- Gradient accents for premium feel
- Subtle animations everywhere
- Generous spacing and typography
- Glass morphism for elevated surfaces

---

## 2. Color System

### 2.1 Foundation Colors

```typescript
// Design tokens - use in Tailwind config
const colors = {
  // Background layers (darkest to lightest)
  background: {
    base: '#09090b',      // zinc-950 - main bg
    elevated: '#18181b',  // zinc-900 - cards
    surface: '#27272a',   // zinc-800 - inputs
    overlay: '#3f3f46',   // zinc-700 - active states
  },
  
  // Brand gradient
  accent: {
    primary: '#8b5cf6',   // violet-500
    secondary: '#06b6d4', // cyan-500
    // Gradient: from violet-500 to cyan-500
  },
  
  // Text hierarchy
  text: {
    primary: '#ffffff',   // white
    secondary: '#a1a1aa', // zinc-400
    tertiary: '#71717a',  // zinc-500
    inverted: '#09090b',  // for buttons
  },
  
  // Semantic colors
  semantic: {
    success: '#22c55e',   // green-500
    warning: '#f59e0b',   // amber-500
    error: '#ef4444',     // red-500
    info: '#3b82f6',      // blue-500
  },
};
```

### 2.2 Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          base: '#09090b',
          elevated: '#18181b',
          surface: '#27272a',
          overlay: '#3f3f46',
        },
        accent: {
          primary: '#8b5cf6',
          secondary: '#06b6d4',
        },
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
        'gradient-glow': 'radial-gradient(circle at center, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-sm': '0 0 20px rgba(139, 92, 246, 0.15)',
        'glow-md': '0 0 40px rgba(139, 92, 246, 0.2)',
        'glow-lg': '0 0 60px rgba(139, 92, 246, 0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
```

---

## 3. Typography

### 3.1 Font Setup

```css
/* index.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

:root {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 3.2 Typography Scale

```typescript
// Typography classes
const typography = {
  // Headings
  'display': 'text-5xl font-extrabold tracking-tight',    // 48px
  'h1': 'text-3xl font-bold tracking-tight',              // 30px
  'h2': 'text-2xl font-semibold tracking-tight',          // 24px
  'h3': 'text-xl font-semibold',                          // 20px
  'h4': 'text-lg font-semibold',                          // 18px
  
  // Body
  'body-lg': 'text-lg font-normal',                       // 18px
  'body': 'text-base font-normal',                        // 16px
  'body-sm': 'text-sm font-normal',                       // 14px
  
  // UI elements
  'label': 'text-sm font-medium',                         // 14px medium
  'caption': 'text-xs font-normal',                       // 12px
  'overline': 'text-xs font-semibold uppercase tracking-widest',
  
  // Numbers (tabular)
  'mono': 'font-mono tabular-nums',
};
```

### 3.3 Typography Components

```tsx
// components/ui/Typography.tsx
interface TextProps {
  variant?: keyof typeof textVariants;
  color?: 'primary' | 'secondary' | 'tertiary' | 'accent';
  className?: string;
  children: React.ReactNode;
}

const textVariants = {
  display: 'text-5xl font-extrabold tracking-tight',
  h1: 'text-3xl font-bold tracking-tight',
  h2: 'text-2xl font-semibold tracking-tight',
  h3: 'text-xl font-semibold',
  h4: 'text-lg font-semibold',
  'body-lg': 'text-lg',
  body: 'text-base',
  'body-sm': 'text-sm',
  label: 'text-sm font-medium',
  caption: 'text-xs',
};

const colorVariants = {
  primary: 'text-white',
  secondary: 'text-zinc-400',
  tertiary: 'text-zinc-500',
  accent: 'text-violet-500',
};

export function Text({ 
  variant = 'body', 
  color = 'primary', 
  className = '',
  children 
}: TextProps) {
  return (
    <span className={`${textVariants[variant]} ${colorVariants[color]} ${className}`}>
      {children}
    </span>
  );
}
```

---

## 4. Spacing System

### 4.1 Spacing Scale (Tailwind)

```
4px  = p-1   (micro)
8px  = p-2   (xs)
12px = p-3   (sm)
16px = p-4   (md) - default padding
20px = p-5   (lg)
24px = p-6   (xl)
32px = p-8   (2xl)
48px = p-12  (3xl)
64px = p-16  (4xl)
```

### 4.2 Layout Guidelines

```typescript
const layoutGuidelines = {
  // Screen padding
  screenPaddingX: 'px-4',           // 16px
  screenPaddingTop: 'pt-16',        // 64px (safe area)
  screenPaddingBottom: 'pb-32',     // 128px (player + nav)
  
  // Card padding
  cardPadding: 'p-4',               // 16px
  cardPaddingLg: 'p-6',             // 24px
  
  // Gaps
  gridGap: 'gap-4',                 // 16px
  listGap: 'gap-3',                 // 12px
  inlineGap: 'gap-2',               // 8px
  
  // Border radius
  radiusSm: 'rounded-lg',           // 8px
  radiusMd: 'rounded-xl',           // 12px
  radiusLg: 'rounded-2xl',          // 16px
  radiusFull: 'rounded-full',
};
```

---

## 5. Component Library

### 5.1 Button Component

```tsx
// components/ui/Button.tsx
import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-r from-violet-500 to-cyan-500 
    text-white font-semibold
    shadow-glow-sm hover:shadow-glow-md
    active:scale-98 
    transition-all duration-200
  `,
  secondary: `
    bg-background-surface 
    text-white font-medium
    border border-zinc-700
    hover:bg-background-overlay hover:border-zinc-600
    active:scale-98
    transition-all duration-200
  `,
  ghost: `
    bg-transparent
    text-zinc-400 font-medium
    hover:text-white hover:bg-white/5
    active:scale-98
    transition-all duration-200
  `,
  destructive: `
    bg-red-500/10
    text-red-500 font-medium
    border border-red-500/30
    hover:bg-red-500/20 hover:border-red-500/50
    active:scale-98
    transition-all duration-200
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm rounded-lg',
  md: 'h-11 px-6 text-base rounded-xl',
  lg: 'h-14 px-8 text-lg rounded-xl',
  icon: 'h-11 w-11 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  children,
  ...props
}, ref) => {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center gap-2
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  );
});

Button.displayName = 'Button';
```

### 5.2 Input Component

```tsx
// components/ui/Input.tsx
import { forwardRef, useState } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = '',
  ...props
}, ref) => {
  const [focused, setFocused] = useState(false);

  return (
    <div className="w-full">
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          {label}
        </label>
      )}
      
      {/* Input container */}
      <div
        className={`
          relative flex items-center
          bg-background-surface rounded-xl
          border transition-all duration-200
          ${focused 
            ? 'border-accent-primary ring-2 ring-accent-primary/20' 
            : error 
              ? 'border-red-500'
              : 'border-transparent'
          }
        `}
      >
        {/* Left icon */}
        {leftIcon && (
          <span className="absolute left-4 text-zinc-500">
            {leftIcon}
          </span>
        )}
        
        {/* Input */}
        <input
          ref={ref}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`
            w-full h-12 bg-transparent
            text-white placeholder-zinc-500
            focus:outline-none
            ${leftIcon ? 'pl-12' : 'pl-4'}
            ${rightIcon ? 'pr-12' : 'pr-4'}
            ${className}
          `}
          {...props}
        />
        
        {/* Right icon */}
        {rightIcon && (
          <span className="absolute right-4 text-zinc-500">
            {rightIcon}
          </span>
        )}
      </div>
      
      {/* Error/Hint */}
      {(error || hint) && (
        <p className={`mt-2 text-sm ${error ? 'text-red-500' : 'text-zinc-500'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
```

### 5.3 Card Component

```tsx
// components/ui/Card.tsx
interface CardProps {
  variant?: 'elevated' | 'outlined' | 'glass';
  padding?: 'sm' | 'md' | 'lg' | 'none';
  pressable?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const variantStyles = {
  elevated: 'bg-background-elevated',
  outlined: 'bg-transparent border border-zinc-800',
  glass: `
    bg-white/5 backdrop-blur-xl
    border border-white/10
  `,
};

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  variant = 'elevated',
  padding = 'md',
  pressable = false,
  className = '',
  children,
  onClick,
}: CardProps) {
  const Component = pressable ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        rounded-2xl
        ${variantStyles[variant]}
        ${paddingStyles[padding]}
        ${pressable ? 'transition-transform active:scale-98 text-left w-full' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}
```

### 5.4 Book Card Component

```tsx
// components/library/BookCard.tsx
import type { Book } from '../../types/book';

interface BookCardProps {
  book: Book;
  onPress: () => void;
}

export function BookCard({ book, onPress }: BookCardProps) {
  const progressPercent = book.progress 
    ? Math.round((book.progress.position / book.totalDuration) * 100)
    : 0;

  return (
    <button
      onClick={onPress}
      className="group relative overflow-hidden rounded-2xl bg-background-elevated transition-all duration-300 active:scale-98"
    >
      {/* Cover Image */}
      <div className="aspect-[2/3] relative overflow-hidden">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-600/30 to-cyan-600/30 flex items-center justify-center">
            <span className="text-5xl">📚</span>
          </div>
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        {/* Hover glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 to-cyan-500/0 group-hover:from-violet-500/10 group-hover:to-cyan-500/10 transition-all duration-500" />
        
        {/* Play icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
            <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        {/* Progress bar */}
        {progressPercent > 0 && (
          <div className="h-1 bg-zinc-700/50 rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
        
        {/* Title & Author */}
        <h3 className="text-white font-semibold line-clamp-2 mb-1">
          {book.title}
        </h3>
        <p className="text-zinc-400 text-sm line-clamp-1">
          {book.author}
        </p>
        
        {/* Duration badge */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            {formatDuration(book.totalDuration)}
          </span>
          {progressPercent > 0 && (
            <span className="text-xs text-violet-400">
              {progressPercent}%
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
```

### 5.5 Progress Slider Component

```tsx
// components/player/ProgressSlider.tsx
import { useState, useRef, useCallback } from 'react';

interface ProgressSliderProps {
  value: number;        // 0-1
  buffered?: number;    // 0-1
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  formatTime?: (value: number) => string;
  duration: number;     // seconds
}

export function ProgressSlider({
  value,
  buffered = 0,
  onChange,
  onChangeEnd,
  formatTime,
  duration,
}: ProgressSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const calculateValue = useCallback((clientX: number) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return percent;
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const newValue = calculateValue(e.clientX);
    onChange(newValue);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const newValue = calculateValue(e.clientX);
    setHoverValue(newValue);
    if (isDragging) {
      onChange(newValue);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && onChangeEnd) {
      onChangeEnd(value);
    }
    setIsDragging(false);
  };

  const displayValue = isDragging ? value : (hoverValue ?? value);
  const displayTime = formatTime 
    ? formatTime(displayValue * duration)
    : formatSeconds(displayValue * duration);

  return (
    <div className="w-full">
      {/* Time tooltip on hover */}
      {hoverValue !== null && (
        <div 
          className="absolute -top-8 transform -translate-x-1/2 bg-background-surface px-2 py-1 rounded text-xs text-white pointer-events-none"
          style={{ left: `${hoverValue * 100}%` }}
        >
          {displayTime}
        </div>
      )}
      
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-2 cursor-pointer group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverValue(null)}
        onMouseUp={handleMouseUp}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-zinc-700 rounded-full" />
        
        {/* Buffered */}
        {buffered > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-zinc-600 rounded-full"
            style={{ width: `${buffered * 100}%` }}
          />
        )}
        
        {/* Progress */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full transition-all"
          style={{ width: `${value * 100}%` }}
        />
        
        {/* Thumb */}
        <div
          className={`
            absolute top-1/2 -translate-y-1/2 -translate-x-1/2
            w-4 h-4 bg-white rounded-full shadow-lg
            transition-all duration-150
            ${isDragging ? 'scale-125' : 'scale-0 group-hover:scale-100'}
          `}
          style={{ left: `${value * 100}%` }}
        />
      </div>
      
      {/* Time labels */}
      <div className="flex justify-between mt-2 text-xs text-zinc-500">
        <span>{formatSeconds(value * duration)}</span>
        <span>{formatSeconds(duration)}</span>
      </div>
    </div>
  );
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
```

### 5.6 Player Controls Component

```tsx
// components/player/PlayerControls.tsx
interface PlayerControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSkipBack: () => void;  // -15s
  onSkipForward: () => void; // +30s
  hasPrevious: boolean;
  hasNext: boolean;
}

export function PlayerControls({
  isPlaying,
  onPlayPause,
  onPrevious,
  onNext,
  onSkipBack,
  onSkipForward,
  hasPrevious,
  hasNext,
}: PlayerControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      {/* Previous Chapter */}
      <button
        onClick={onPrevious}
        disabled={!hasPrevious}
        className={`
          p-3 rounded-full transition-all
          ${hasPrevious 
            ? 'text-white hover:bg-white/10 active:scale-95' 
            : 'text-zinc-600 cursor-not-allowed'
          }
        `}
      >
        <SkipBackIcon className="w-6 h-6" />
      </button>
      
      {/* Skip -15s */}
      <button
        onClick={onSkipBack}
        className="p-3 text-zinc-400 hover:text-white transition-colors active:scale-95"
      >
        <Replay15Icon className="w-8 h-8" />
      </button>
      
      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        className="
          w-18 h-18 rounded-full
          bg-gradient-to-r from-violet-500 to-cyan-500
          flex items-center justify-center
          shadow-glow-md hover:shadow-glow-lg
          transition-all duration-200
          active:scale-95
        "
      >
        {isPlaying ? (
          <PauseIcon className="w-8 h-8 text-white" />
        ) : (
          <PlayIcon className="w-8 h-8 text-white ml-1" />
        )}
      </button>
      
      {/* Skip +30s */}
      <button
        onClick={onSkipForward}
        className="p-3 text-zinc-400 hover:text-white transition-colors active:scale-95"
      >
        <Forward30Icon className="w-8 h-8" />
      </button>
      
      {/* Next Chapter */}
      <button
        onClick={onNext}
        disabled={!hasNext}
        className={`
          p-3 rounded-full transition-all
          ${hasNext 
            ? 'text-white hover:bg-white/10 active:scale-95' 
            : 'text-zinc-600 cursor-not-allowed'
          }
        `}
      >
        <SkipForwardIcon className="w-6 h-6" />
      </button>
    </div>
  );
}
```

### 5.7 Mini Player Component

```tsx
// components/player/MiniPlayer.tsx
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { usePlayer } from '../../hooks/usePlayer';

export function MiniPlayer() {
  const navigate = useNavigate();
  const { currentBook, playbackState, position, duration, currentChapterIndex } = usePlayerStore();
  const { togglePlayPause } = usePlayer();

  // Don't render if no book loaded
  if (!currentBook) return null;

  const chapter = currentBook.chapters[currentChapterIndex];
  const progress = duration > 0 ? position / duration : 0;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40">
      {/* Progress bar */}
      <div className="h-1 bg-zinc-800">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      
      {/* Content */}
      <button
        onClick={() => navigate(`/player/${currentBook.id}`)}
        className="
          w-full flex items-center gap-3 p-3
          bg-background-elevated/95 backdrop-blur-lg
          border-t border-zinc-800/50
          text-left
        "
      >
        {/* Cover */}
        {currentBook.coverUrl ? (
          <img
            src={currentBook.coverUrl}
            alt={currentBook.title}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-violet-600/30 to-cyan-600/30 flex items-center justify-center">
            <span>📚</span>
          </div>
        )}
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">
            {currentBook.title}
          </p>
          <p className="text-zinc-400 text-xs truncate">
            {chapter?.title || `Chapter ${currentChapterIndex + 1}`}
          </p>
        </div>
        
        {/* Play/Pause button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            togglePlayPause();
          }}
          className="
            w-11 h-11 rounded-full
            bg-white/10
            flex items-center justify-center
            active:scale-95 transition-transform
          "
        >
          {playbackState === 'playing' ? (
            <PauseIcon className="w-5 h-5 text-white" />
          ) : (
            <PlayIcon className="w-5 h-5 text-white ml-0.5" />
          )}
        </button>
      </button>
    </div>
  );
}
```

---

## 6. Animation Guidelines

### 6.1 Transition Presets

```typescript
// Animation durations
const durations = {
  instant: '0ms',
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  entrance: '400ms',
};

// Easing functions
const easings = {
  easeOut: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0.0, 1, 1)',
  easeInOut: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
  spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
};

// Common transitions
const transitions = {
  default: 'transition-all duration-200 ease-out',
  fast: 'transition-all duration-150 ease-out',
  slow: 'transition-all duration-300 ease-out',
  spring: 'transition-transform duration-300 cubic-bezier(0.175, 0.885, 0.32, 1.275)',
};
```

### 6.2 Micro-interactions

```tsx
// Press feedback
const pressScale = 'active:scale-95';
const pressScaleSmall = 'active:scale-98';

// Hover states
const hoverOpacity = 'hover:opacity-80';
const hoverScale = 'hover:scale-105';
const hoverGlow = 'hover:shadow-glow-md';

// Focus states (accessibility)
const focusRing = 'focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-background-base';
```

### 6.3 Loading States

```tsx
// components/ui/Skeleton.tsx
interface SkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'circular' | 'text';
}

export function Skeleton({ className = '', variant = 'rectangular' }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-zinc-800';
  const variantClasses = {
    rectangular: 'rounded-lg',
    circular: 'rounded-full',
    text: 'rounded h-4',
  };

  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} />
  );
}

// components/ui/Spinner.tsx
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <svg
      className={`animate-spin ${sizeClasses[size]} ${className}`}
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
```

---

## 7. Layout Templates

### 7.1 Screen Template

```tsx
// components/layout/Screen.tsx
interface ScreenProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  bottomPadding?: boolean;  // For screens with bottom nav
  children: React.ReactNode;
}

export function Screen({
  title,
  subtitle,
  showBack = false,
  rightAction,
  bottomPadding = true,
  children,
}: ScreenProps) {
  const navigate = useNavigate();

  return (
    <div className={`min-h-screen bg-background-base ${bottomPadding ? 'pb-32' : ''}`}>
      {/* Header */}
      {(title || showBack) && (
        <header className="sticky top-0 z-30 bg-background-base/80 backdrop-blur-lg border-b border-zinc-800/50">
          <div className="flex items-center justify-between p-4 pt-16">
            <div className="flex items-center gap-3">
              {showBack && (
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 -ml-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <ChevronLeftIcon className="w-6 h-6 text-white" />
                </button>
              )}
              <div>
                {title && (
                  <h1 className="text-2xl font-bold text-white">{title}</h1>
                )}
                {subtitle && (
                  <p className="text-zinc-400 text-sm">{subtitle}</p>
                )}
              </div>
            </div>
            {rightAction}
          </div>
        </header>
      )}
      
      {/* Content */}
      {children}
    </div>
  );
}
```

### 7.2 Bottom Sheet

```tsx
// components/ui/BottomSheet.tsx
import { useEffect, useRef } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      >
        <div className="bg-background-elevated rounded-t-3xl max-h-[85vh] overflow-hidden">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-zinc-600 rounded-full" />
          </div>
          
          {/* Title */}
          {title && (
            <div className="px-6 py-3 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
            </div>
          )}
          
          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto">
            {children}
          </div>
          
          {/* Safe area padding */}
          <div className="h-8" />
        </div>
      </div>
    </>
  );
}
```

---

## 8. Iconography

### 8.1 Icon Guidelines

- Use **24x24px** icons for standard UI
- Use **20x20px** for compact UI
- Use **28-32px** for primary actions
- Stroke width: 1.5-2px
- Consistent visual weight

### 8.2 Essential Icons

```tsx
// Use Heroicons (https://heroicons.com) or similar

// Player icons
export function PlayIcon(props: SVGProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5v14l11-7z"/>
    </svg>
  );
}

export function PauseIcon(props: SVGProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
    </svg>
  );
}

// Navigation icons
export function HomeIcon(props: SVGProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
  );
}

// Add more icons as needed...
```

---

## 9. Responsive Breakpoints

```typescript
// Tailwind default breakpoints
const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
};

// PWA responsive patterns
const responsivePatterns = {
  // Grid columns
  gridCols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  
  // Padding
  screenPadding: 'px-4 sm:px-6 lg:px-8',
  
  // Max width for content
  maxWidth: 'max-w-7xl mx-auto',
  
  // Font sizes
  responsiveTitle: 'text-2xl sm:text-3xl lg:text-4xl',
};
```

---

## 10. Accessibility Checklist

```typescript
const accessibilityChecklist = {
  // Color contrast
  contrastRatios: {
    normal: 4.5,  // WCAG AA for normal text
    large: 3.0,   // WCAG AA for large text (18px+)
    icons: 3.0,   // UI components
  },
  
  // Focus indicators
  focusVisible: 'focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
  
  // Screen reader
  srOnly: 'sr-only',  // For hidden labels
  
  // Touch targets
  minTouchTarget: '44px',  // Apple HIG minimum
  
  // Motion
  reduceMotion: 'motion-reduce:transition-none motion-reduce:animate-none',
};
```

---

*Part 4 of 5 - Continue to Part 5: Development Phases*
