/**
 * Agent Overlay Component
 * Visual feedback for agent actions on the page
 * Now uses EnhancedAgentOverlay for advanced features
 */

import React from 'react';
import EnhancedAgentOverlay from './EnhancedAgentOverlay';
import type { AgentAction } from '@/hooks/useAgentMode';

export interface AgentOverlayAction extends AgentAction {
  confidence?: number;
  isSensitive?: boolean;
}

interface AgentOverlayProps {
  active?: boolean;
  currentAction?: AgentOverlayAction;
  actionHistory?: AgentOverlayAction[];
  onActionComplete?: (actionId: string) => void;
  onUndoAction?: (actionId: string) => void;
  onConfirmSensitiveAction?: (actionId: string) => Promise<boolean>;
  enableVoiceNarration?: boolean;
  enableScreenRecording?: boolean;
}

export const AgentOverlay: React.FC<AgentOverlayProps> = (props) => {
  return <EnhancedAgentOverlay {...props} />;
};

export default AgentOverlay;

