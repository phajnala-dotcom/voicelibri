/**
 * VoiceLibri - Neumorphism Bottom Navigation
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Reference: scss/neumorphism/components/_nav.scss
 */

import { Library, Sparkles, BookOpen, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Library', icon: Library },
  { path: '/generate', label: 'Generate', icon: Sparkles },
  { path: '/classics', label: 'Explore', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Neumorphism Bottom Navigation
 * Tab bar with raised active state
 */
export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav 
      className="
        fixed bottom-0 left-0 right-0 z-50
        bg-[var(--neu-body-bg)]
        shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]
        border-t border-[var(--neu-gray-400)]
      "
    >
      <div 
        className="flex items-center justify-around px-2 gap-2"
        style={{ 
          height: 'var(--nav-height)',
          paddingBottom: 'var(--safe-area-bottom)'
        }}
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                flex flex-col items-center justify-center
                flex-1 py-2 px-1
                rounded-[var(--neu-radius)]
                transition-all duration-200
                ${isActive 
                  ? 'neu-pressed text-[var(--neu-secondary)]' 
                  : 'neu-raised text-[var(--neu-gray-700)] hover:text-[var(--neu-dark)]'
                }
              `.replace(/\s+/g, ' ').trim()}
            >
              <Icon 
                className={`
                  w-5 h-5
                  transition-transform duration-200
                  ${isActive ? 'scale-110' : ''}
                `.replace(/\s+/g, ' ').trim()} 
              />
              <span 
                className="text-xs mt-1 font-semibold"
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
