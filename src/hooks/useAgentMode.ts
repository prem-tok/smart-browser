/**
 * Agent Mode Hook
 * Manages agent automation state and controls
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface AgentAction {
  id: string;
  type: 'click' | 'type' | 'scroll' | 'hover' | 'navigate' | 'wait' | 'screenshot';
  target?: {
    selector?: string;
    x?: number;
    y?: number;
    text?: string;
  };
  element?: {
    selector?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: Date;
  duration?: number;
  error?: string;
  confidence?: number; // 0-100, how sure AI is about the action
  isSensitive?: boolean; // Payment, deletion, etc.
}

interface UseAgentModeOptions {
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  onPause?: () => Promise<void>;
  onResume?: () => Promise<void>;
  onActionComplete?: (actionId: string) => void;
}

export function useAgentMode(options: UseAgentModeOptions = {}) {
  const { onStart, onStop, onPause, onResume, onActionComplete } = options;
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentAction, setCurrentAction] = useState<AgentAction | null>(null);
  const [actionHistory, setActionHistory] = useState<AgentAction[]>([]);
  const [progress, setProgress] = useState(0);
  const actionCounterRef = useRef(0);

  // Start agent mode
  const start = useCallback(async () => {
    if (isActive) return;

    setIsActive(true);
    setIsPaused(false);
    setProgress(0);
    actionCounterRef.current = 0;

    try {
      await onStart?.();
    } catch (error) {
      setIsActive(false);
      throw error;
    }
  }, [isActive, onStart]);

  // Stop agent mode
  const stop = useCallback(async () => {
    if (!isActive) return;

    setIsActive(false);
    setIsPaused(false);
    setCurrentAction(null);
    setProgress(0);

    try {
      await onStop?.();
    } catch (error) {
      console.error('Failed to stop agent:', error);
    }
  }, [isActive, onStop]);

  // Pause agent mode
  const pause = useCallback(async () => {
    if (!isActive || isPaused) return;

    setIsPaused(true);

    try {
      await onPause?.();
    } catch (error) {
      console.error('Failed to pause agent:', error);
    }
  }, [isActive, isPaused, onPause]);

  // Resume agent mode
  const resume = useCallback(async () => {
    if (!isActive || !isPaused) return;

    setIsPaused(false);

    try {
      await onResume?.();
    } catch (error) {
      console.error('Failed to resume agent:', error);
    }
  }, [isActive, isPaused, onResume]);

  // Add action
  const addAction = useCallback(
    (action: Omit<AgentAction, 'id' | 'timestamp' | 'status'>) => {
      actionCounterRef.current += 1;
      const newAction: AgentAction = {
        ...action,
        id: `action-${actionCounterRef.current}`,
        timestamp: new Date(),
        status: 'pending',
      };

      setActionHistory((prev) => [...prev, newAction]);
      setCurrentAction(newAction);

      return newAction.id;
    },
    []
  );

  // Update action status
  const updateAction = useCallback(
    (actionId: string, updates: Partial<AgentAction>) => {
      setActionHistory((prev) =>
        prev.map((action) => (action.id === actionId ? { ...action, ...updates } : action))
      );

      if (currentAction?.id === actionId) {
        setCurrentAction((prev) => (prev ? { ...prev, ...updates } : null));
      }

      if (updates.status === 'completed' || updates.status === 'failed') {
        onActionComplete?.(actionId);
      }
    },
    [currentAction, onActionComplete]
  );

  // Clear history
  const clearHistory = useCallback(() => {
    setActionHistory([]);
    setCurrentAction(null);
  }, []);

  // Get action statistics
  const getStats = useCallback(() => {
    const total = actionHistory.length;
    const completed = actionHistory.filter((a) => a.status === 'completed').length;
    const failed = actionHistory.filter((a) => a.status === 'failed').length;
    const running = actionHistory.filter((a) => a.status === 'running').length;

    return {
      total,
      completed,
      failed,
      running,
      successRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }, [actionHistory]);

  return {
    isActive,
    isPaused,
    currentAction,
    actionHistory,
    progress,
    start,
    stop,
    pause,
    resume,
    addAction,
    updateAction,
    clearHistory,
    getStats,
    setProgress,
  };
}

