/**
 * VoiceLibri - Neumorphism Input Component
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Reference: scss/neumorphism/forms/_form-control.scss
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/**
 * Neumorphism Text Input
 * Inset shadow input field
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-sm font-medium text-[var(--neu-dark)] mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--neu-gray-600)]">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            neu-input
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${error ? 'border-[var(--neu-danger)]' : ''}
            ${className}
          `.replace(/\s+/g, ' ').trim()}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--neu-gray-600)]">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-[var(--neu-danger)]">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1 text-xs text-[var(--neu-gray-600)]">{hint}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * Search Input - Specialized search field
 */
interface SearchInputProps extends Omit<InputProps, 'type'> {
  onSearch?: (value: string) => void;
}

export function SearchInput({ onSearch, className = '', ...props }: SearchInputProps) {
  return (
    <Input
      type="search"
      placeholder="Search..."
      leftIcon={
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      }
      className={className}
      onChange={(e) => onSearch?.(e.target.value)}
      {...props}
    />
  );
}

/**
 * Textarea - Neumorphism textarea
 */
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  hint,
  className = '',
  id,
  ...props
}, ref) => {
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="w-full">
      {label && (
        <label 
          htmlFor={textareaId}
          className="block text-sm font-medium text-[var(--neu-dark)] mb-2"
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={`
          neu-input resize-none min-h-[100px]
          ${error ? 'border-[var(--neu-danger)]' : ''}
          ${className}
        `.replace(/\s+/g, ' ').trim()}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-[var(--neu-danger)]">{error}</p>
      )}
      {hint && !error && (
        <p className="mt-1 text-xs text-[var(--neu-gray-600)]">{hint}</p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';
