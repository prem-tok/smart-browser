/**
 * Action Timeline Component
 * Shows action history with undo capability
 */

import React, { useCallback } from 'react';
import { Button, Tooltip, Badge } from 'antd';
import {
  UndoOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { AgentAction } from '@/hooks/useAgentMode';
import { formatDistanceToNow } from 'date-fns';
import styles from './ActionTimeline.module.css';

interface ActionTimelineProps {
  actions: AgentAction[];
  onUndo?: (actionId: string) => void;
  onSelectAction?: (actionId: string) => void;
  selectedActionId?: string;
}

const ActionTimeline: React.FC<ActionTimelineProps> = ({
  actions,
  onUndo,
  onSelectAction,
  selectedActionId,
}) => {
  const getStatusIcon = (status: AgentAction['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined className={styles.statusIconCompleted} />;
      case 'failed':
        return <CloseCircleOutlined className={styles.statusIconFailed} />;
      case 'running':
        return <PlayCircleOutlined className={styles.statusIconRunning} />;
      default:
        return <ClockCircleOutlined className={styles.statusIconPending} />;
    }
  };

  const getActionIcon = (type: AgentAction['type']) => {
    const icons: Record<string, string> = {
      click: '👆',
      type: '⌨️',
      scroll: '📜',
      hover: '👋',
      navigate: '🔗',
      wait: '⏳',
      screenshot: '📸',
    };
    return icons[type] || '⚡';
  };

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineHeader}>
        <span className={styles.timelineTitle}>Action History</span>
        <Badge count={actions.length} showZero />
      </div>
      <div className={styles.timelineList}>
        {actions.length === 0 ? (
          <div className={styles.emptyState}>No actions yet</div>
        ) : (
          actions.map((action, index) => (
            <div
              key={action.id}
              className={`${styles.timelineItem} ${
                selectedActionId === action.id ? styles.selected : ''
              }`}
              onClick={() => onSelectAction?.(action.id)}
            >
              <div className={styles.timelineConnector} />
              <div className={styles.timelineContent}>
                <div className={styles.timelineHeaderRow}>
                  <div className={styles.timelineIcon}>
                    {getActionIcon(action.type)}
                  </div>
                  <div className={styles.timelineInfo}>
                    <div className={styles.timelineDescription}>
                      {action.description}
                    </div>
                    <div className={styles.timelineMeta}>
                      {formatDistanceToNow(action.timestamp, { addSuffix: true })}
                      {action.duration && ` • ${action.duration}ms`}
                    </div>
                  </div>
                  <div className={styles.timelineActions}>
                    {getStatusIcon(action.status)}
                    {action.status === 'completed' && onUndo && (
                      <Tooltip title="Undo this action">
                        <Button
                          type="text"
                          size="small"
                          icon={<UndoOutlined />}
                          className={styles.undoButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUndo(action.id);
                          }}
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>
                {action.error && (
                  <div className={styles.timelineError}>{action.error}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActionTimeline;

