/**
 * Left Agent Sidebar Component
 * AI Agent panel on the left side of the browser
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Input,
  Avatar,
  Badge,
  Tooltip,
  Progress,
  Spin,
  message as antdMessage,
  Drawer,
} from 'antd';
import {
  CloseOutlined,
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ExpandOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useLayoutStore } from '@/stores/layoutStore';
import { useTaskManager } from '@/hooks/useTaskManager';
import { ModelConfigBar } from '@/components/ModelConfigBar';
import type { DisplayMessage } from '@/models';
import styles from './LeftAgentSidebar.module.css';

const { TextArea } = Input;

// Helper function to extract text content from DisplayMessage
const getMessageContent = (message: DisplayMessage): string => {
  if (message.type === 'user') {
    return message.content || '';
  } else if (message.type === 'agent_group') {
    // Extract text from agent group messages - get all text messages
    const textMessages = message.messages?.filter(m => m.type === 'text') || [];
    if (textMessages.length > 0) {
      // Combine all text messages
      const contents = textMessages
        .map(m => (m as any).content)
        .filter(c => c && typeof c === 'string')
        .join('\n');
      if (contents) return contents;
    }
    
    // Check for result
    if (message.result) {
      const result = message.result;
      if (typeof result === 'string') return result;
      if (typeof result === 'object' && result !== null) {
        // Try to extract meaningful text from result object
        if (result.text) return result.text;
        if (result.content) return result.content;
        if (result.message) return result.message;
        // Fallback to JSON string
        return JSON.stringify(result, null, 2);
      }
      return String(result);
    }
    
    // Try to get result from last tool message
    const lastMessage = message.messages?.[message.messages.length - 1];
    if (lastMessage && lastMessage.type === 'tool') {
      const toolResult = (lastMessage as any).result;
      if (toolResult) {
        if (typeof toolResult === 'string') return toolResult;
        if (typeof toolResult === 'object' && toolResult !== null) {
          if (toolResult.text) return toolResult.text;
          if (toolResult.content) return toolResult.content;
        }
      }
    }
    
    // If we have messages but no text, show a summary
    if (message.messages && message.messages.length > 0) {
      return `Agent ${message.agentName} executed ${message.messages.length} action(s)`;
    }
    
    return `Agent ${message.agentName} is working...`;
  } else if (message.type === 'workflow') {
    if (message.thinking?.text) {
      return message.thinking.text;
    }
    if (message.workflow?.thought) {
      return message.workflow.thought;
    }
    return 'Workflow planning...';
  }
  return '';
};

// Helper function to determine message role
const getMessageRole = (message: DisplayMessage): 'user' | 'assistant' => {
  return message.type === 'user' ? 'user' : 'assistant';
};

interface LeftAgentSidebarProps {
  onSendMessage?: (message: string) => void;
}

export const LeftAgentSidebar: React.FC<LeftAgentSidebarProps> = ({
  onSendMessage,
}) => {
  const { agentSidebarOpen, setAgentSidebarOpen } = useLayoutStore();
  const {
    currentTask,
    messages,
    tasks,
    currentTaskId,
    setCurrentTaskId,
    createTask,
    updateTask,
    updateMessages,
    replaceTaskId,
  } = useTaskManager();
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTaskRunning, setIsTaskRunning] = useState(false);
  const [currentTaskStatus, setCurrentTaskStatus] = useState<string>('');
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ekoRequestRef = useRef<Promise<any> | null>(null);

  // Get messages - use current task messages, or fallback to most recent task
  const displayMessages = useMemo(() => {
    if (messages && messages.length > 0) {
      return messages;
    }
    // If no current task messages, try to get from most recent task
    if (tasks.length > 0) {
      const mostRecentTask = tasks
        .filter(t => t.messages && t.messages.length > 0)
        .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0))[0];
      return mostRecentTask?.messages || [];
    }
    return [];
  }, [messages, tasks]);

  // Listen to EkoService stream messages for real-time updates
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api || !(window.api as any).onEkoStreamMessage) {
      return;
    }

    const handleStreamMessage = (streamMessage: any) => {
      console.log('[LeftAgentSidebar] Stream message received:', streamMessage);

      // Handle workflow messages (task planning)
      if (streamMessage.type === 'workflow' && streamMessage.workflow) {
        const workflow = streamMessage.workflow;
        const taskId = workflow.taskId || currentTaskId;

        if (taskId) {
          // Create or update task with workflow
          if (!currentTask || currentTask.id !== taskId) {
            createTask(taskId, {
              name: workflow.name || `Task ${taskId.slice(0, 8)}`,
              status: 'running',
            });
            setCurrentTaskId(taskId);
          }

          // Add workflow message
          const workflowMessage: DisplayMessage = {
            id: `workflow-${Date.now()}`,
            type: 'workflow',
            workflow: workflow,
            thinking: streamMessage.thinking,
            timestamp: new Date(),
          };

          updateMessages(taskId, [
            ...(currentTask?.messages || []),
            workflowMessage,
          ]);
        }
      }

      // Handle agent group messages
      if (streamMessage.type === 'agent_group' && streamMessage.agentName) {
        const taskId = currentTaskId || streamMessage.taskId;
        if (taskId) {
          const agentMessage: DisplayMessage = {
            id: `agent-${Date.now()}`,
            type: 'agent_group',
            agentName: streamMessage.agentName,
            messages: streamMessage.messages || [],
            result: streamMessage.result,
            timestamp: new Date(),
          };

          updateMessages(taskId, [
            ...(currentTask?.messages || []),
            agentMessage,
          ]);
        }
      }

      // Handle task ID replacement (when temp task becomes real task)
      if (streamMessage.type === 'workflow' && streamMessage.workflow?.taskId) {
        const newTaskId = streamMessage.workflow.taskId;
        if (currentTaskId && currentTaskId.startsWith('temp-') && newTaskId !== currentTaskId) {
          replaceTaskId(currentTaskId, newTaskId);
          setCurrentTaskId(newTaskId);
        }
      }

      // Handle task completion
      if (streamMessage.type === 'finish' && currentTaskId) {
        setIsTaskRunning(false);
        setCurrentTaskStatus(streamMessage.finishReason || 'completed');
        updateTask(currentTaskId, {
          status: streamMessage.finishReason || 'completed',
        });
      }

      // Handle errors
      if (streamMessage.type === 'error' && currentTaskId) {
        setIsTaskRunning(false);
        setCurrentTaskStatus('error');
        updateTask(currentTaskId, {
          status: 'error',
        });
        antdMessage.error(streamMessage.error || 'Task failed');
      }
    };

    // Register stream message listener
    if ((window.api as any).onEkoStreamMessage) {
      (window.api as any).onEkoStreamMessage(handleStreamMessage);
    }

    return () => {
      // Cleanup: remove all listeners for eko-stream-message
      if (typeof window !== 'undefined' && window.api) {
        (window.api as any).removeAllListeners?.('eko-stream-message');
      }
    };
  }, [currentTaskId, currentTask, createTask, updateTask, updateMessages, replaceTaskId, setCurrentTaskId]);

  // Determine agent mode state from task status
  const agentModeActive = isTaskRunning || (currentTask?.status === 'running');
  const agentModePaused = currentTaskStatus === 'paused';

  // Format messages for display - filter out empty messages
  const formattedMessages = useMemo(() => {
    return displayMessages
      .map((message) => {
        const content = getMessageContent(message);
        return {
          id: message.id,
          role: getMessageRole(message),
          content,
          timestamp: message.timestamp || new Date(),
        };
      })
      .filter((msg) => msg.content && msg.content.trim().length > 0); // Filter out empty messages
  }, [displayMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [formattedMessages]);

  // Handle send message using EkoService
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isSending) return;

    const message = inputValue.trim();
    setInputValue('');
    setIsSending(true);
    setIsTaskRunning(true);

    try {
      // Check if we have a current task
      const isTemporaryTask = !currentTaskId || currentTaskId.startsWith('temp-');

      if (isTemporaryTask) {
        // Create new temporary task ID
        const tempTaskId = `temp-${Date.now()}`;
        createTask(tempTaskId, {
          name: `Task ${tempTaskId.slice(0, 8)}`,
          status: 'running',
        });
        setCurrentTaskId(tempTaskId);

        // Add user message
        const userMessage: DisplayMessage = {
          id: `user-${Date.now()}`,
          type: 'user',
          content: message,
          timestamp: new Date(),
        };
        updateMessages(tempTaskId, [userMessage]);

        // Cancel any existing request
        if (ekoRequestRef.current && currentTaskId) {
          try {
            await (window.api as any)?.ekoCancelTask?.(currentTaskId);
            await ekoRequestRef.current;
          } catch (error) {
            console.warn('Failed to cancel previous task:', error);
          }
        }

        // Run new task via EkoService
        if (onSendMessage) {
          await onSendMessage(message);
        } else if (typeof window !== 'undefined' && (window.api as any)?.ekoRun) {
          const request = (window.api as any).ekoRun(message);
          ekoRequestRef.current = request;
          const result = await request;
          ekoRequestRef.current = null;

          // Update task status based on result
          if (result && result.stopReason) {
            setIsTaskRunning(false);
            setCurrentTaskStatus(result.stopReason);
            const finalTaskId = currentTaskId || tempTaskId;
            updateTask(finalTaskId, {
              status: result.stopReason,
            });
          }
        }
      } else {
        // Modify existing task
        const userMessage: DisplayMessage = {
          id: `user-${Date.now()}`,
          type: 'user',
          content: message,
          timestamp: new Date(),
        };
        updateMessages(currentTaskId, [
          ...(currentTask?.messages || []),
          userMessage,
        ]);

        // Cancel any existing request
        if (ekoRequestRef.current) {
          try {
            await (window.api as any)?.ekoCancelTask?.(currentTaskId);
            await ekoRequestRef.current;
          } catch (error) {
            console.warn('Failed to cancel previous task:', error);
          }
        }

        // Modify task via EkoService
        if (typeof window !== 'undefined' && (window.api as any)?.ekoModify) {
          const request = (window.api as any).ekoModify(currentTaskId, message);
          ekoRequestRef.current = request;
          const result = await request;
          ekoRequestRef.current = null;

          // Update task status
          if (result && result.stopReason) {
            setIsTaskRunning(false);
            setCurrentTaskStatus(result.stopReason);
            updateTask(currentTaskId, {
              status: result.stopReason,
            });
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      setIsTaskRunning(false);
      setCurrentTaskStatus('error');
      
      if (currentTaskId) {
        updateTask(currentTaskId, {
          status: 'error',
        });
      }

      // Show user-friendly error message
      const errorMessage = error?.message || error?.toString() || 'Failed to send message';
      antdMessage.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  }, [
    inputValue,
    isSending,
    currentTaskId,
    currentTask,
    onSendMessage,
    createTask,
    updateTask,
    updateMessages,
    setCurrentTaskId,
  ]);

  // Handle input key press
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);

    // Auto-resize
    e.target.style.height = 'auto';
    const newHeight = Math.min(e.target.scrollHeight, 120); // Max 4 lines
    e.target.style.height = `${newHeight}px`;
  }, []);

  if (!agentSidebarOpen) {
    return null;
  }

  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            <RobotOutlined className={styles.headerIcon} />
            <span>AI Agent</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Tooltip title="Model Settings">
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => setSettingsDrawerOpen(true)}
              className={styles.closeButton}
            />
          </Tooltip>
          <Tooltip title="Close sidebar">
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={() => setAgentSidebarOpen(false)}
              className={styles.closeButton}
            />
          </Tooltip>
        </div>
      </div>

      {/* Agent Mode Panel */}
      {agentModeActive && (
        <div className={styles.agentPanel}>
          <div className={styles.agentHeader}>
            <Badge status="processing" text="Agent Mode Active" />
            <div className={styles.agentActions}>
              <Tooltip title="Stop Task">
                <Button
                  type="text"
                  icon={<StopOutlined />}
                  size="small"
                  danger
                  onClick={async () => {
                    if (currentTaskId && typeof window !== 'undefined' && (window.api as any)?.ekoCancelTask) {
                      try {
                        setIsTaskRunning(false);
                        await (window.api as any).ekoCancelTask(currentTaskId);
                        updateTask(currentTaskId, {
                          status: 'cancelled',
                        });
                        antdMessage.info('Task cancelled');
                      } catch (error) {
                        console.error('Failed to cancel task:', error);
                        antdMessage.error('Failed to cancel task');
                      }
                    }
                  }}
                />
              </Tooltip>
            </div>
          </div>
          {currentTaskStatus && (
            <div className={styles.agentActivity}>
              <Spin size="small" />
              <span>Task {currentTaskStatus}</span>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className={styles.messages}>
        {formattedMessages.length === 0 ? (
          <div className={styles.emptyState}>
            <RobotOutlined className={styles.emptyIcon} />
            <p>Start a conversation with AI Agent</p>
            <p className={styles.emptySubtext}>
              Ask questions, give commands, or start automated tasks
            </p>
          </div>
        ) : (
          formattedMessages.map((message) => (
            <div
              key={message.id}
              className={`${styles.message} ${styles[`message${message.role}`]}`}
            >
              <Avatar
                size="small"
                className={styles.messageAvatar}
                icon={message.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
              />
              <div className={styles.messageContent}>
                <div className={styles.messageText}>{message.content}</div>
                <div className={styles.messageTimestamp}>
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        {isSending && (
          <div className={`${styles.message} ${styles.messageassistant}`}>
            <Avatar
              size="small"
              className={styles.messageAvatar}
              icon={<RobotOutlined />}
            />
            <div className={styles.messageContent}>
              <Spin size="small" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className={styles.inputContainer}>
        <div className={styles.inputWrapper}>
          <TextArea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="Ask AI or enter command..."
            className={styles.input}
            rows={1}
            disabled={isSending}
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending}
            className={styles.sendButton}
            loading={isSending}
          />
        </div>
      </div>

      {/* Model Settings Drawer */}
      <Drawer
        title="AI Model Configuration"
        placement="right"
        onClose={() => setSettingsDrawerOpen(false)}
        open={settingsDrawerOpen}
        width={400}
        styles={{
          body: {
            padding: '16px',
            background: 'var(--background-primary)',
          },
        }}
      >
        <ModelConfigBar />
      </Drawer>
    </div>
  );
};

export default LeftAgentSidebar;

