/**
 * VoiceLibri - Neumorphism Toggle/Switch Component
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Reference: scss/neumorphism/forms/_custom-switch.scss
 */

import { useState } from 'react';

interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Neumorphism Toggle Switch
 * Custom checkbox styled as switch
 */
export function Toggle({
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  label,
  size = 'md',
  className = '',
}: ToggleProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internalChecked;

  const handleChange = () => {
    if (disabled) return;
    const newValue = !isChecked;
    if (!isControlled) {
      setInternalChecked(newValue);
    }
    onChange?.(newValue);
  };

  const sizeClasses = {
    sm: {
      track: 'w-8 h-5',
      thumb: 'w-3 h-3',
      translate: 'translate-x-3.5',
    },
    md: {
      track: 'w-10 h-6',
      thumb: 'w-4 h-4',
      translate: 'translate-x-4',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <label 
      className={`
        inline-flex items-center gap-3
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      {/* Switch track */}
      <div
        onClick={handleChange}
        className={`
          ${sizes.track}
          rounded-full relative
          transition-all duration-200
          ${isChecked 
            ? 'bg-[var(--neu-secondary)]' 
            : 'bg-[var(--neu-gray-400)] shadow-[var(--neu-shadow-inset)]'
          }
        `.replace(/\s+/g, ' ').trim()}
        role="switch"
        aria-checked={isChecked}
      >
        {/* Switch thumb */}
        <div
          className={`
            ${sizes.thumb}
            absolute top-1 left-1
            bg-[var(--neu-white)] rounded-full
            shadow-[var(--neu-shadow-light)]
            transition-transform duration-200
            ${isChecked ? sizes.translate : ''}
          `.replace(/\s+/g, ' ').trim()}
        />
      </div>
      
      {/* Label */}
      {label && (
        <span className="text-sm text-[var(--neu-body-color)]">
          {label}
        </span>
      )}
    </label>
  );
}

/**
 * Checkbox - Neumorphism checkbox
 */
interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function Checkbox({
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  label,
  className = '',
}: CheckboxProps) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? checked : internalChecked;

  const handleChange = () => {
    if (disabled) return;
    const newValue = !isChecked;
    if (!isControlled) {
      setInternalChecked(newValue);
    }
    onChange?.(newValue);
  };

  return (
    <label 
      className={`
        inline-flex items-center gap-3
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      {/* Checkbox */}
      <div
        onClick={handleChange}
        className={`
          w-5 h-5 rounded-[var(--neu-radius-sm)]
          flex items-center justify-center
          transition-all duration-200
          ${isChecked 
            ? 'bg-[var(--neu-secondary)] text-white' 
            : 'neu-pressed'
          }
        `.replace(/\s+/g, ' ').trim()}
        role="checkbox"
        aria-checked={isChecked}
      >
        {isChecked && (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </div>
      
      {/* Label */}
      {label && (
        <span className="text-sm text-[var(--neu-body-color)]">
          {label}
        </span>
      )}
    </label>
  );
}

/**
 * Radio - Neumorphism radio button
 */
interface RadioProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  name?: string;
  value?: string;
  className?: string;
}

export function Radio({
  checked = false,
  onChange,
  disabled = false,
  label,
  name,
  value,
  className = '',
}: RadioProps) {
  const handleChange = () => {
    if (disabled) return;
    onChange?.(!checked);
  };

  return (
    <label 
      className={`
        inline-flex items-center gap-3
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `.replace(/\s+/g, ' ').trim()}
    >
      {/* Radio */}
      <div
        onClick={handleChange}
        className={`
          w-5 h-5 rounded-full
          flex items-center justify-center
          transition-all duration-200
          ${checked 
            ? 'bg-[var(--neu-secondary)]' 
            : 'neu-pressed'
          }
        `.replace(/\s+/g, ' ').trim()}
        role="radio"
        aria-checked={checked}
      >
        {checked && (
          <div className="w-2 h-2 rounded-full bg-white" />
        )}
      </div>
      
      {/* Hidden input for form compatibility */}
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange?.(!checked)}
        className="sr-only"
      />
      
      {/* Label */}
      {label && (
        <span className="text-sm text-[var(--neu-body-color)]">
          {label}
        </span>
      )}
    </label>
  );
}
