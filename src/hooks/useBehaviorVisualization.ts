/**
 * Hook for updating behavior visualization state
 * Use this in HumanAgent or action handlers to update the visualization
 */

import { useEffect } from 'react';
import { useBehaviorVisualizationStore } from '@/stores/behaviorVisualizationStore';
import type { BehaviorAction } from '@/stores/behaviorVisualizationStore';

/**
 * Hook to update behavior visualization
 * Automatically updates the visualization store when actions occur
 */
export function useBehaviorVisualization() {
  const {
    setActive,
    setAction,
    addMousePoint,
    clearMousePath,
    setDelaying,
    updateDelayProgress,
  } = useBehaviorVisualizationStore();

  /**
   * Start a behavior action
   */
  const startAction = (
    action: BehaviorAction,
    details?: {
      selector?: string;
      text?: string;
      progress?: number;
    }
  ) => {
    setAction(action, details);
  };

  /**
   * Update typing progress
   */
  const updateTypingProgress = (progress: number, text?: string) => {
    setAction('typing', {
      text,
      progress: Math.min(100, Math.max(0, progress)),
    });
  };

  /**
   * Add mouse movement point
   */
  const addMouseMovement = (x: number, y: number) => {
    addMousePoint({
      x,
      y,
      timestamp: Date.now(),
    });
  };

  /**
   * Start a delay
   */
  const startDelay = (duration: number) => {
    setDelaying(true, duration);
    
    // Animate delay progress
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed / duration) * 100;
      updateDelayProgress(progress);
      
      if (progress >= 100) {
        clearInterval(interval);
        setDelaying(false);
      }
    }, 50);
    
    return () => clearInterval(interval);
  };

  /**
   * End current action
   */
  const endAction = () => {
    setAction('idle');
    clearMousePath();
  };

  return {
    startAction,
    updateTypingProgress,
    addMouseMovement,
    startDelay,
    endAction,
    setActive,
    clearMousePath,
  };
}

/**
 * Hook to enable/disable visualization based on human behavior settings
 * Use this in a component that has access to human behavior settings
 */
export function useBehaviorVisualizationAuto() {
  const { setActive } = useBehaviorVisualizationStore();
  const { settings } = useBehaviorVisualizationStore();
  
  useEffect(() => {
    // Auto-enable/disable based on settings
    setActive(settings.enabled);
  }, [settings.enabled, setActive]);
}

