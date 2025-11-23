/**
 * Enhanced Agent Overlay Component
 * Magical and trustworthy visual feedback for agent actions
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Tooltip, Progress, Badge, Button, Switch, Modal, message } from 'antd';
import {
  WarningOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { AgentAction } from '@/hooks/useAgentMode';
import AgentMinimap from './AgentMinimap';
import ActionTimeline from './ActionTimeline';
import { useVoiceNarration } from '@/hooks/useVoiceNarration';
import { useScreenRecording } from '@/hooks/useScreenRecording';
import styles from './EnhancedAgentOverlay.module.css';

export interface EnhancedAgentAction extends AgentAction {
  confidence?: number; // 0-100
  isSensitive?: boolean; // Payment, deletion, etc.
  element?: {
    selector?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
}

interface EnhancedAgentOverlayProps {
  active?: boolean;
  currentAction?: EnhancedAgentAction;
  actionHistory?: EnhancedAgentAction[];
  onActionComplete?: (actionId: string) => void;
  onUndoAction?: (actionId: string) => void;
  onConfirmSensitiveAction?: (actionId: string) => Promise<boolean>;
  enableVoiceNarration?: boolean;
  enableScreenRecording?: boolean;
}

const EnhancedAgentOverlay: React.FC<EnhancedAgentOverlayProps> = ({
  active = false,
  currentAction,
  actionHistory = [],
  onActionComplete,
  onUndoAction,
  onConfirmSensitiveAction,
  enableVoiceNarration = false,
  enableScreenRecording = false,
}) => {
  const outlineRef = useRef<SVGPathElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  // Voice narration
  const { speak, isSpeaking, stop: stopNarration } = useVoiceNarration({
    enabled: enableVoiceNarration,
  });

  // Screen recording
  const {
    startRecording,
    stopRecording,
    isRecording: recordingActive,
    recordingUrl,
  } = useScreenRecording({
    enabled: enableScreenRecording,
  });

  // Draw smooth outline animation
  useEffect(() => {
    if (!active || !currentAction?.element || !outlineRef.current) return;

    const { x, y, width, height } = currentAction.element;
    if (x === undefined || y === undefined || width === undefined || height === undefined) return;

    const path = outlineRef.current;
    const pathLength = path.getTotalLength();

    // Animate drawing
    path.style.strokeDasharray = `${pathLength}`;
    path.style.strokeDashoffset = `${pathLength}`;
    path.style.animation = 'none';

    // Trigger animation
    requestAnimationFrame(() => {
      path.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
      path.style.strokeDashoffset = '0';
    });

    // Update path
    const radius = 8;
    const d = `
      M ${x + radius} ${y}
      L ${x + width - radius} ${y}
      Q ${x + width} ${y} ${x + width} ${y + radius}
      L ${x + width} ${y + height - radius}
      Q ${x + width} ${y + height} ${x + width - radius} ${y + height}
      L ${x + radius} ${y + height}
      Q ${x} ${y + height} ${x} ${y + height - radius}
      L ${x} ${y + radius}
      Q ${x} ${y} ${x + radius} ${y}
      Z
    `;
    path.setAttribute('d', d);
  }, [active, currentAction]);

  // Position tooltip
  useEffect(() => {
    if (!currentAction?.element || !tooltipRef.current) return;

    const { x, y, width, height } = currentAction.element;
    if (x === undefined || y === undefined || width === undefined || height === undefined) return;

    const tooltip = tooltipRef.current;
    tooltip.style.left = `${x + width / 2}px`;
    tooltip.style.top = `${y - 50}px`;
  }, [currentAction]);

  // Voice narration
  useEffect(() => {
    if (enableVoiceNarration && currentAction?.description) {
      speak(currentAction.description);
    }
  }, [currentAction, enableVoiceNarration, speak]);

  // Screen recording
  useEffect(() => {
    if (enableScreenRecording && active && !recordingActive) {
      startRecording();
      setIsRecording(true);
    } else if (!active && recordingActive) {
      stopRecording();
      setIsRecording(false);
    }
  }, [active, enableScreenRecording, recordingActive, startRecording, stopRecording]);

  // Show warning for sensitive actions
  useEffect(() => {
    if (currentAction?.isSensitive && onConfirmSensitiveAction) {
      setShowWarning(true);
    }
  }, [currentAction, onConfirmSensitiveAction]);

  // Handle sensitive action confirmation
  const handleSensitiveAction = useCallback(async () => {
    if (!currentAction || !onConfirmSensitiveAction) return;

    const confirmed = await onConfirmSensitiveAction(currentAction.id);
    if (confirmed) {
      setShowWarning(false);
      onActionComplete?.(currentAction.id);
    } else {
      setShowWarning(false);
    }
  }, [currentAction, onConfirmSensitiveAction, onActionComplete]);

  // Get confidence color
  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return '#6b7280';
    if (confidence >= 80) return '#10a37f';
    if (confidence >= 60) return '#f59e0b';
    return '#ef4444';
  };

  // Get viewport and page rects for minimap
  const { viewportRect, pageRect, agentPosition } = useMemo(() => {
    if (!currentAction?.element) {
      return { viewportRect: undefined, pageRect: undefined, agentPosition: undefined };
    }

    const { x, y, width, height } = currentAction.element;
    const viewportRect = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const pageRect = new DOMRect(0, 0, document.documentElement.scrollWidth, document.documentElement.scrollHeight);
    const agentPosition = x !== undefined && y !== undefined ? { x: x + width! / 2, y: y + height! / 2 } : undefined;

    return { viewportRect, pageRect, agentPosition };
  }, [currentAction]);

  if (!active) {
    return null;
  }

  return (
    <>
      {/* SVG Outline Animation */}
      {currentAction?.element && (
        <svg className={styles.outlineSvg} style={{ pointerEvents: 'none' }}>
          <path
            ref={outlineRef}
            className={styles.outlinePath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* Enhanced Tooltip */}
      {currentAction && (
        <div ref={tooltipRef} className={styles.enhancedTooltip}>
          <div className={styles.tooltipHeader}>
            <div className={styles.tooltipIcon}>
              {currentAction.type === 'click' && '👆'}
              {currentAction.type === 'type' && '⌨️'}
              {currentAction.type === 'scroll' && '📜'}
              {currentAction.type === 'hover' && '👋'}
              {currentAction.type === 'navigate' && '🔗'}
            </div>
            <div className={styles.tooltipContent}>
              <div className={styles.tooltipDescription}>{currentAction.description}</div>
              {currentAction.confidence !== undefined && (
                <div className={styles.confidenceIndicator}>
                  <Progress
                    percent={currentAction.confidence}
                    size="small"
                    strokeColor={getConfidenceColor(currentAction.confidence)}
                    showInfo={false}
                    className={styles.confidenceBar}
                  />
                  <span className={styles.confidenceText}>
                    {currentAction.confidence}% confident
                  </span>
                </div>
              )}
            </div>
            {currentAction.isSensitive && (
              <WarningOutlined className={styles.warningIcon} />
            )}
          </div>
        </div>
      )}

      {/* Warning Modal for Sensitive Actions */}
      <Modal
        title={
          <div className={styles.warningHeader}>
            <WarningOutlined className={styles.warningIconLarge} />
            <span>Sensitive Action Detected</span>
          </div>
        }
        open={showWarning && currentAction?.isSensitive}
        onOk={handleSensitiveAction}
        onCancel={() => setShowWarning(false)}
        okText="Confirm"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
        className={styles.warningModal}
      >
        <div className={styles.warningContent}>
          <p>The agent is about to perform a sensitive action:</p>
          <div className={styles.warningAction}>
            <strong>{currentAction?.description}</strong>
          </div>
          <p className={styles.warningNote}>
            This action may involve payments, deletions, or other irreversible operations.
            Please confirm to proceed.
          </p>
        </div>
      </Modal>

      {/* Minimap */}
      {showMinimap && (
        <AgentMinimap
          viewportRect={viewportRect}
          pageRect={pageRect}
          agentPosition={agentPosition}
          visible={active}
        />
      )}

      {/* Action Timeline */}
      {showTimeline && (
        <div className={styles.timelineContainer}>
          <div className={styles.timelineHeader}>
            <span>Actions</span>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setShowTimeline(false)}
            />
          </div>
          <ActionTimeline
            actions={actionHistory}
            onUndo={onUndoAction}
            selectedActionId={currentAction?.id}
          />
        </div>
      )}

      {/* Control Panel */}
      <div className={styles.controlPanel}>
        <div className={styles.controlItem}>
          <Switch
            checked={showMinimap}
            onChange={setShowMinimap}
            size="small"
          />
          <span className={styles.controlLabel}>Minimap</span>
        </div>
        <div className={styles.controlItem}>
          <Switch
            checked={showTimeline}
            onChange={setShowTimeline}
            size="small"
          />
          <span className={styles.controlLabel}>Timeline</span>
        </div>
        {enableVoiceNarration && (
          <div className={styles.controlItem}>
            <Badge dot={isSpeaking}>
              <SoundOutlined className={styles.controlIcon} />
            </Badge>
            <span className={styles.controlLabel}>Voice</span>
          </div>
        )}
        {enableScreenRecording && (
          <div className={styles.controlItem}>
            <Badge dot={isRecording} color="red">
              <VideoCameraOutlined className={styles.controlIcon} />
            </Badge>
            <span className={styles.controlLabel}>Recording</span>
          </div>
        )}
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <div className={styles.recordingIndicator}>
          <div className={styles.recordingDot} />
          <span>Recording...</span>
        </div>
      )}
    </>
  );
};

export default EnhancedAgentOverlay;

