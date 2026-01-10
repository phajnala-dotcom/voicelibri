/**
 * VoiceLibri - Neumorphism Button Component
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Reference: scss/neumorphism/components/_buttons.scss
 */

import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  icon?: boolean;
  loading?: boolean;
  block?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

/**
 * Neumorphism Button
 * Soft UI button with raised/inset shadow transitions
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  pill = false,
  icon = false,
  loading = false,
  block = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  children,
  ...props
}, ref) => {
  const isDisabled = disabled || loading;

  // Base neumorphism button class
  const baseClass = 'neu-btn';
  
  // Variant classes from neumorphism buttons
  const variantClass = `neu-btn-${variant}`;
  
  // Size classes
  const sizeClass = size !== 'md' ? `neu-btn-${size}` : '';
  
  // Shape modifiers
  const pillClass = pill ? 'neu-btn-pill' : '';
  const iconClass = icon ? `neu-btn-icon${size === 'sm' ? '-sm' : size === 'lg' ? '-lg' : ''}` : '';
  const blockClass = block ? 'w-full' : '';
  
  // State classes
  const disabledClass = isDisabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : '';

  const classes = [
    baseClass,
    variantClass,
    sizeClass,
    pillClass,
    iconClass,
    blockClass,
    disabledClass,
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={classes}
      {...props}
    >
      {loading ? (
        <span className="neu-spinner" />
      ) : (
        <>
          {leftIcon && <span className="btn-icon-left mr-2">{leftIcon}</span>}
          {children && <span className="btn-text">{children}</span>}
          {rightIcon && <span className="btn-icon-right ml-2">{rightIcon}</span>}
        </>
      )}
    </button>
  );
});

Button.displayName = 'Button';

/**
 * Icon Button - Circular neumorphism button
 * Reference: neumorphism social buttons
 */
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'raised' | 'inset' | 'flat';
  label: string;
}

export function IconButton({
  icon,
  size = 'md',
  variant = 'raised',
  label,
  disabled = false,
  className = '',
  ...props
}: IconButtonProps) {
  const sizeClasses = {
    sm: 'neu-btn-icon-sm',
    md: 'neu-btn-icon',
    lg: 'neu-btn-icon-lg',
  };

  const variantClasses = {
    raised: 'neu-raised',
    inset: 'neu-pressed',
    flat: 'neu-flat',
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        flex items-center justify-center
        text-[var(--neu-gray-700)]
        transition-all duration-200
        hover:text-[var(--neu-secondary)]
        active:shadow-[var(--neu-shadow-inset)]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `.replace(/\s+/g, ' ').trim()}
      aria-label={label}
      {...props}
    >
      {icon}
    </button>
  );
}

/**
 * Button Group - Neumorphism button group
 */
interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
}

export function ButtonGroup({ children, className = '' }: ButtonGroupProps) {
  return (
    <div className={`inline-flex rounded-[var(--neu-radius)] overflow-hidden ${className}`}>
      {children}
    </div>
  );
}
