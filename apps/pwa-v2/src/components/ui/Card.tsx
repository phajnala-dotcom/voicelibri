/**
 * VoiceLibri - Neumorphism Card Component
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Reference: scss/neumorphism/components/_card.scss
 */

import { type ReactNode, type HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'raised' | 'inset' | 'flat';
  hover?: boolean;
  children: ReactNode;
}

/**
 * Neumorphism Card
 * Soft shadow card component
 */
export function Card({
  variant = 'raised',
  hover = true,
  className = '',
  children,
  ...props
}: CardProps) {
  const variantClasses = {
    raised: 'neu-card',
    inset: 'neu-pressed',
    flat: 'neu-flat',
  };

  const hoverClass = hover && variant === 'raised' ? 'hover:shadow-[var(--neu-shadow-soft)]' : '';

  return (
    <div 
      className={`${variantClasses[variant]} ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Card Header
 */
interface CardHeaderProps {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
}

export function CardHeader({ children, className = '', bordered = false }: CardHeaderProps) {
  return (
    <div className={`
      neu-card-header
      ${bordered ? 'border-b border-[var(--neu-gray-400)]' : ''}
      ${className}
    `.replace(/\s+/g, ' ').trim()}>
      {children}
    </div>
  );
}

/**
 * Card Body
 */
interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return (
    <div className={`neu-card-body ${className}`}>
      {children}
    </div>
  );
}

/**
 * Card Footer
 */
interface CardFooterProps {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
}

export function CardFooter({ children, className = '', bordered = false }: CardFooterProps) {
  return (
    <div className={`
      neu-card-footer
      ${bordered ? 'border-t border-[var(--neu-gray-400)]' : ''}
      ${className}
    `.replace(/\s+/g, ' ').trim()}>
      {children}
    </div>
  );
}

/**
 * Profile Card - For audiobook items
 * Reference: neumorphism profile card widget
 */
interface ProfileCardProps {
  imageUrl?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  progress?: number;
  onClick?: () => void;
  className?: string;
}

export function ProfileCard({
  imageUrl,
  title,
  subtitle,
  badge,
  progress,
  onClick,
  className = '',
}: ProfileCardProps) {
  return (
    <div 
      className={`
        neu-card p-4 
        ${onClick ? 'cursor-pointer active:shadow-[var(--neu-shadow-inset)]' : ''} 
        transition-shadow duration-200 
        ${className}
      `.replace(/\s+/g, ' ').trim()}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Image in inset frame */}
      <div className="neu-pressed rounded-[var(--neu-radius)] overflow-hidden mb-4 aspect-square">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[var(--neu-secondary)]/20 to-[var(--neu-info)]/20 flex items-center justify-center">
            <span className="text-4xl">📚</span>
          </div>
        )}
      </div>
      
      {/* Progress bar */}
      {progress !== undefined && progress > 0 && (
        <div className="neu-progress mb-3">
          <div 
            className="neu-progress-bar" 
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
      
      {/* Content */}
      <h3 className="text-[var(--neu-dark)] font-semibold text-sm truncate">
        {title}
      </h3>
      {subtitle && (
        <p className="text-[var(--neu-gray-700)] text-xs mt-1 truncate">
          {subtitle}
        </p>
      )}
      {badge && (
        <span className="neu-badge neu-badge-pill mt-2 text-[var(--neu-secondary)]">
          {badge}
        </span>
      )}
    </div>
  );
}

/**
 * Alert Card - Neumorphism notification card
 * Reference: neumorphism alerts
 */
interface AlertCardProps {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function AlertCard({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  className = '',
}: AlertCardProps) {
  const variantColors = {
    info: 'var(--neu-info)',
    success: 'var(--neu-success)',
    warning: 'var(--neu-warning)',
    danger: 'var(--neu-danger)',
  };

  return (
    <div 
      className={`
        neu-pressed p-4 border-l-4
        ${className}
      `.replace(/\s+/g, ' ').trim()}
      style={{ borderColor: variantColors[variant] }}
    >
      <div className="flex items-start justify-between">
        <div>
          {title && (
            <h4 
              className="font-semibold mb-1"
              style={{ color: variantColors[variant] }}
            >
              {title}
            </h4>
          )}
          <div className="text-[var(--neu-body-color)] text-sm">{children}</div>
        </div>
        {dismissible && (
          <button
            onClick={onDismiss}
            className="text-[var(--neu-gray-700)] hover:text-[var(--neu-dark)] transition-colors ml-4"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
