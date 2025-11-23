/**
 * Browser Viewport Component
 * Main browser view with embedded AI agent
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import EmbeddedAIAgent from './EmbeddedAIAgent';
import { useLayoutStore } from '@/stores/layoutStore';
import styles from './BrowserViewport.module.css';

interface BrowserViewportProps {
  url?: string;
  isLoading?: boolean;
  onNavigate?: (url: string) => void;
  agentModeActive?: boolean;
  onToggleAgentMode?: () => void;
}

const BrowserViewport: React.FC<BrowserViewportProps> = ({
  url,
  isLoading,
  onNavigate,
  agentModeActive,
  onToggleAgentMode,
}) => {
  const { agentSidebarOpen } = useLayoutStore();
  const [agentMinimized, setAgentMinimized] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Position the Electron detailView within the container
  const positionDetailView = useCallback(() => {
    if (!containerRef.current || typeof window === 'undefined' || !window.api) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    // Position detailView to match the container's position and size
    if ((window.api as any).positionDetailView) {
      (window.api as any).positionDetailView({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }).catch((error: any) => {
        console.error('Failed to position detail view:', error);
      });
    }
  }, []);

  // Position detailView on mount and when container size changes
  useEffect(() => {
    // Ensure detailView is visible
    if (typeof window !== 'undefined' && window.api && (window.api as any).setDetailViewVisible) {
      (window.api as any).setDetailViewVisible(true);
    }

    // Initial positioning
    const timeoutId = setTimeout(() => {
      positionDetailView();
    }, 100); // Small delay to ensure DOM is ready

    // Update position on window resize
    const handleResize = () => {
      positionDetailView();
    };

    window.addEventListener('resize', handleResize);

    // Use ResizeObserver to watch for container size changes
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        positionDetailView();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver && containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, [positionDetailView]);

  // Agent visibility is controlled by agentModeActive prop
  // No need for separate showAIAgent state


  return (
    <div className={styles.browserViewport} ref={viewportRef}>
      {/* Browser Content Area */}
      <div className={styles.browserContent}>
        {/* This is where the Electron detailView will be rendered */}
        <div
          id="browser-viewport-container"
          ref={containerRef}
          className={styles.viewportContainer}
        />
      </div>

      {/* Embedded AI Agent - Only show when agent mode is active AND sidebar is closed */}
      {agentModeActive && !agentSidebarOpen && (
        <EmbeddedAIAgent
          minimized={agentMinimized}
          onMinimize={() => setAgentMinimized(true)}
          onMaximize={() => setAgentMinimized(false)}
          onClose={() => {
            onToggleAgentMode?.();
          }}
          agentModeActive={agentModeActive}
        />
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner} />
        </div>
      )}
    </div>
  );
};

export default BrowserViewport;

