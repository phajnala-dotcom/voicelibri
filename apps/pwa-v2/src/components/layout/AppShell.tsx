/**
 * VoiceLibri - Neumorphism App Shell
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * Main layout wrapper
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNavigation } from '../navigation';
import { MiniPlayer } from '../player';
import { FullPlayer } from './FullPlayer';
import { usePlayerStore } from '../../stores/playerStore';

/**
 * Neumorphism App Shell
 * Main app layout with navigation and player
 */
export function AppShell() {
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const { currentBook } = usePlayerStore();

  return (
    <div className="min-h-screen bg-[var(--neu-body-bg)]">
      {/* Main content area */}
      <main 
        className="pb-safe"
        style={{ 
          paddingBottom: currentBook 
            ? 'calc(var(--nav-height) + var(--mini-player-height) + var(--safe-area-bottom))' 
            : 'calc(var(--nav-height) + var(--safe-area-bottom))'
        }}
      >
        <Outlet />
      </main>
      
      {/* Mini Player */}
      <MiniPlayer onExpand={() => setIsPlayerExpanded(true)} />
      
      {/* Bottom Navigation */}
      <BottomNavigation />
      
      {/* Full Player Modal */}
      {isPlayerExpanded && (
        <FullPlayer onCollapse={() => setIsPlayerExpanded(false)} />
      )}
    </div>
  );
}
