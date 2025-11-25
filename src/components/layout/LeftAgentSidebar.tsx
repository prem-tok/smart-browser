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
import { MessageProcessor } from '@/utils/messageTransform';
import type { StreamCallbackMessage } from '@jarvis-agent/core/dist/types';
import { uuidv4 } from '@/common/utils';
import { MessageList } from '@/components/chat/MessageComponents';
import type { HumanResponseMessage } from '@/models/human-interaction';
import styles from './LeftAgentSidebar.module.css';

const { TextArea } = Input;

// Helper function to extract text content from DisplayMessage
const getMessageContent = (message: DisplayMessage): string => {
  if (message.type === 'user') {
    return message.content || '';
  } else if (message.type === 'agent_group') {
    const agentMsg = message as any;
    const agentStatus = agentMsg.status;
    const isCompleted = agentStatus === 'completed' || agentStatus === 'done';
    
    // Get all tool messages
    const toolMessages = message.messages?.filter(m => m.type === 'tool') || [];
    const textMessages = message.messages?.filter(m => m.type === 'text') || [];
    
    // Priority 1: Agent-level result (final summary)
    if (message.result) {
      const result = message.result;
      let resultText = '';
      
      if (typeof result === 'string') {
        resultText = result;
      } else if (typeof result === 'object' && result !== null) {
        const resultObj = result as Record<string, any>;
        if (resultObj.text && typeof resultObj.text === 'string') {
          resultText = resultObj.text;
        } else if (resultObj.content && typeof resultObj.content === 'string') {
          resultText = resultObj.content;
        } else if (resultObj.message && typeof resultObj.message === 'string') {
          resultText = resultObj.message;
        } else {
          resultText = JSON.stringify(result, null, 2);
        }
      } else {
        resultText = String(result);
      }
      
      // If we have tool messages, append them as details
      if (toolMessages.length > 0) {
        const toolList = toolMessages
          .map((tool: any) => {
            const name = tool.toolName || 'unknown';
            const status = tool.status === 'completed' ? '✓' : tool.status === 'running' ? '⏳' : '';
            return `  • ${name} ${status}`;
          })
          .join('\n');
        return `${resultText}\n\nActions:\n${toolList}`;
      }
      
      return resultText;
    }
    
    // Priority 2: Text messages from agent
    if (textMessages.length > 0) {
      const contents = textMessages
        .map(m => (m as any).content)
        .filter(c => c && typeof c === 'string')
        .join('\n');
      if (contents) {
        // Append tool actions if available
        if (toolMessages.length > 0) {
          const toolList = toolMessages
            .map((tool: any) => {
              const name = tool.toolName || 'unknown';
              const status = tool.status === 'completed' ? '✓' : tool.status === 'running' ? '⏳' : '';
              return `  • ${name} ${status}`;
            })
            .join('\n');
          return `${contents}\n\nActions:\n${toolList}`;
        }
        return contents;
      }
    }
    
    // Priority 3: Tool messages with results
    if (toolMessages.length > 0) {
      const toolDescriptions: string[] = [];
      
      for (const toolMsg of toolMessages) {
        const tool = toolMsg as any;
        const toolName = tool.toolName || 'unknown';
        const toolStatus = tool.status || 'unknown';
        const toolResult = tool.result;
        
        // Format tool action
        let description = `• ${toolName}`;
        
        // Add params if available (simplified)
        if (tool.params) {
          try {
            const paramsStr = typeof tool.params === 'string' 
              ? tool.params 
              : JSON.stringify(tool.params);
            if (paramsStr.length <= 80) {
              description += ` (${paramsStr})`;
            }
          } catch (e) {
            // Ignore param formatting errors
          }
        }
        
        // Add result if available
      if (toolResult) {
          let resultStr = '';
          if (typeof toolResult === 'string') {
            resultStr = toolResult.length > 150 ? toolResult.substring(0, 150) + '...' : toolResult;
          } else if (typeof toolResult === 'object' && toolResult !== null) {
            if (toolResult.text) resultStr = toolResult.text;
            else if (toolResult.content) resultStr = toolResult.content;
            else if (toolResult.message) resultStr = toolResult.message;
            else if (toolResult.success !== undefined) {
              resultStr = toolResult.success ? 'Success' : 'Failed';
            } else {
              resultStr = 'Completed';
            }
            if (resultStr.length > 150) resultStr = resultStr.substring(0, 150) + '...';
          } else {
            resultStr = String(toolResult);
          }
          
          if (resultStr) {
            description += ` → ${resultStr}`;
          }
        } else if (toolStatus === 'completed') {
          description += ' ✓';
        } else if (toolStatus === 'running') {
          description += ' ⏳';
        }
        
        toolDescriptions.push(description);
      }
      
      return toolDescriptions.join('\n');
    }
    
    // Fallback: Generic message
    if (message.messages && message.messages.length > 0) {
      return `Agent ${message.agentName} executed ${message.messages.length} action(s)`;
    }
    
    return `Agent ${message.agentName} is working...`;
  } else if (message.type === 'workflow') {
    // Only return content if there's actual thinking or workflow thought
    if (message.thinking?.text) {
      return message.thinking.text;
    }
    if (message.workflow?.thought) {
      return message.workflow.thought;
    }
    // Return empty string for placeholder workflow messages - they'll be filtered out
    return '';
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
  // Message processor for handling stream messages (same as main.tsx)
  const messageProcessorRef = useRef(new MessageProcessor());
  // Task ID reference (same as main.tsx)
  const taskIdRef = useRef<string | null>(currentTaskId);
  // Execution ID reference (same as main.tsx)
  const executionIdRef = useRef<string>('');

  // Get messages - use current task messages
  // This ensures we only show messages for the currently selected task
  const displayMessages = useMemo(() => {
    if (!currentTaskId) {
      return [];
    }
    
    // Find the current task in the tasks array
    const currentTaskFromStore = tasks.find(t => t.id === currentTaskId);
    
    // Use messages from the task in store if available, otherwise use messages from useTaskManager
    // The useTaskManager's messages are computed from currentTask, which is also based on currentTaskId
    if (currentTaskFromStore && currentTaskFromStore.messages) {
      return currentTaskFromStore.messages;
    }
    
    // Fallback to messages from useTaskManager (which is currentTask?.messages || [])
    // This handles the case where the task exists but messages haven't been set yet
    if (messages && messages.length > 0) {
      return messages;
    }
    
    // If no messages found, return empty array
    return [];
  }, [messages, tasks, currentTaskId, currentTask]);

  // Track streaming messages to avoid duplicates
  const streamingMessageRef = useRef<Map<string, DisplayMessage>>(new Map());

  // Synchronize taskIdRef with currentTaskId (same as main.tsx)
  useEffect(() => {
    taskIdRef.current = currentTaskId;
  }, [currentTaskId]);

  // Listen to EkoService stream messages for real-time updates
  // Use the same MessageProcessor approach as main.tsx
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api || !(window.api as any).onEkoStreamMessage) {
      return;
    }

    const handleStreamMessage = (streamMessage: StreamCallbackMessage) => {
      // Use MessageProcessor to process stream messages (same as main.tsx)
      const updatedMessages = messageProcessorRef.current.processStreamMessage(streamMessage);

      // Handle task ID replacement: temporary task -> real task (same as main.tsx)
      const isCurrentTaskTemporary = taskIdRef.current?.startsWith('temp-');
      const hasRealTaskId = streamMessage.taskId && !streamMessage.taskId.startsWith('temp-');

      if (isCurrentTaskTemporary && hasRealTaskId && taskIdRef.current) {
        const tempTaskId = taskIdRef.current;
        const realTaskId = streamMessage.taskId;

        // Replace task ID
        replaceTaskId(tempTaskId, realTaskId);
        setCurrentTaskId(realTaskId);
        taskIdRef.current = realTaskId;

        // Update task with new workflow info if available
        if (streamMessage.type === 'workflow' && streamMessage.workflow?.name) {
          updateTask(realTaskId, {
            name: streamMessage.workflow.name,
            workflow: streamMessage.workflow,
            messages: updatedMessages
          });
        } else {
          updateTask(realTaskId, { messages: updatedMessages });
        }

        // Set status for new task
        setCurrentTaskStatus('running');
        setIsTaskRunning(true);
        return; // Exit early, task ID has been replaced
      }

      // Set task ID (if not already set and not temporary)
      if (streamMessage.taskId && !taskIdRef.current && !streamMessage.taskId.startsWith('temp-')) {
        setCurrentTaskId(streamMessage.taskId);
        taskIdRef.current = streamMessage.taskId;
        setCurrentTaskStatus('running');
        setIsTaskRunning(true);
      }

      // Update or create task (same as main.tsx)
      const taskIdToUpdate = streamMessage.taskId || taskIdRef.current;
      if (taskIdToUpdate) {
        // Ensure task exists - create it if it doesn't exist
        const taskExists = tasks.some(t => t.id === taskIdToUpdate);
        if (!taskExists && !taskIdToUpdate.startsWith('temp-')) {
          const workflowInfo = (streamMessage as any).workflow;
          createTask(taskIdToUpdate, {
            name: workflowInfo?.name || `Task ${taskIdToUpdate.slice(0, 8)}`,
            status: 'running',
            messages: updatedMessages,
            workflow: workflowInfo
          });
        } else {
          const updates: Partial<any> = {
            messages: updatedMessages
          };

          if (streamMessage.type === 'workflow' && streamMessage.workflow?.name) {
            updates.name = streamMessage.workflow.name;
            updates.workflow = streamMessage.workflow;
            // Set status when workflow starts
            setCurrentTaskStatus('running');
            setIsTaskRunning(true);
          }

          // For error messages, also update task status
          if (streamMessage.type === 'error') {
            updates.status = 'error';
            setIsTaskRunning(false);
            setCurrentTaskStatus('error');
          }

          // Always update task (will only work if task exists)
          updateTask(taskIdToUpdate, updates);
        }
      }

      // Handle specific message types for UI state updates
      if (streamMessage.type === 'finish') {
        const taskId = streamMessage.taskId || taskIdRef.current;
        if (taskId) {
          setIsTaskRunning(false);
          setCurrentTaskStatus('done');
          updateTask(taskId, {
            status: 'done',
          });
        }
      }

      // Handle agent_result messages for final status
      if (streamMessage.type === 'agent_result') {
        const agentNode = streamMessage.agentNode;
        const taskId = streamMessage.taskId || taskIdRef.current;
        
        // Check if agent is done (status can be 'done' or 'completed' as string)
        const agentStatus = agentNode?.status as string;
        if (agentStatus === 'done' || agentStatus === 'completed') {
          setIsTaskRunning(false);
          setCurrentTaskStatus('done');
          if (taskId) {
            updateTask(taskId, {
              status: 'done',
            });
          }
        } else if (agentStatus === 'error') {
          setIsTaskRunning(false);
          setCurrentTaskStatus('error');
          if (taskId) {
            updateTask(taskId, {
              status: 'error',
            });
          }
        }
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
  }, [tasks, createTask, updateTask, updateMessages, replaceTaskId, setCurrentTaskId, setIsTaskRunning, setCurrentTaskStatus]);

  // Determine agent mode state from task status
  // Priority: currentTaskStatus (immediate state) > currentTask?.status (from store)
  // Only show as active if task is actually running, not if it's done/error
  const taskStatus = currentTaskStatus || currentTask?.status;
  const isTaskCompleted = taskStatus === 'done' || taskStatus === 'error';
  const agentModeActive = !isTaskCompleted && (isTaskRunning || taskStatus === 'running');
  const agentModePaused = currentTaskStatus === 'paused';

  // Sync currentTaskStatus with task store when task changes
  useEffect(() => {
    if (currentTask?.status && currentTask.status !== currentTaskStatus) {
      // If task status in store is 'done' or 'error', sync it to currentTaskStatus
      if (currentTask.status === 'done' || currentTask.status === 'error') {
        setCurrentTaskStatus(currentTask.status);
        setIsTaskRunning(false);
      } else if (currentTask.status === 'running' && !currentTaskStatus) {
        // If task is running but currentTaskStatus is empty, set it
        setCurrentTaskStatus('running');
        setIsTaskRunning(true);
      }
    }
  }, [currentTask?.status, currentTaskStatus]);

  // Format messages for display - filter out empty messages and deduplicate
  const formattedMessages = useMemo(() => {
    const seen = new Set<string>();
    const uniqueMessages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
      isStreaming?: boolean;
      messageType?: string;
    }> = [];

    // Check if task is completed - use currentTaskStatus first (immediate state)
    const taskStatus = currentTaskStatus || currentTask?.status;
    const taskCompleted = taskStatus === 'done' || taskStatus === 'error';

    // Process messages in reverse to keep latest version of duplicates
    const reversedMessages = [...displayMessages].reverse();
    
    // Check if we have agent_group messages (actual execution results)
    const hasAgentMessages = displayMessages.some(m => m.type === 'agent_group');
    
    for (const message of reversedMessages) {
      // If task is completed, always skip ALL workflow messages (they're just planning)
      if (taskCompleted && message.type === 'workflow') {
        continue;
      }
      
      // Also skip workflow messages if we have agent messages (planning is done, execution started)
      if (message.type === 'workflow' && hasAgentMessages) {
        // Skip workflow messages once agent execution has started
        continue;
      }
      
      const content = getMessageContent(message);
      const role = getMessageRole(message);
      
      // Skip empty messages
      if (!content || content.trim().length === 0) {
        continue;
      }
      
      // Create a key for deduplication (id + first 50 chars of content)
      const dedupeKey = `${message.id}-${content.substring(0, 50)}`;
      
      // Only add if we haven't seen this exact message
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        uniqueMessages.unshift({
          id: message.id,
          role,
          content,
          timestamp: message.timestamp || new Date(),
          isStreaming: message.type === 'workflow' && !message.workflow?.thought && !taskCompleted,
          messageType: message.type,
        });
      }
    }

    return uniqueMessages;
  }, [displayMessages, currentTask?.status, currentTaskStatus]);

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
      // Check if we should create a new task:
      // 1. No current task ID
      // 2. Current task ID is temporary
      // 3. Current task is completed (done, error, or any finish reason like 'tool-calls')
      const currentTaskStatusCheck = currentTaskStatus || currentTask?.status;
      // Task is completed if status is 'done', 'error', or if task is not running
      const isTaskCompleted = currentTaskStatusCheck === 'done' || 
                              currentTaskStatusCheck === 'error' || 
                              (!isTaskRunning && currentTaskStatusCheck && currentTaskStatusCheck !== 'running');
      const isTemporaryTask = !currentTaskId || currentTaskId.startsWith('temp-');
      const shouldCreateNewTask = isTemporaryTask || isTaskCompleted;

      if (shouldCreateNewTask) {
        // Reset status for new task
        setCurrentTaskStatus('');
        
        // Generate new execution ID for each task execution (same as main.tsx)
        const newExecutionId = uuidv4();
        executionIdRef.current = newExecutionId;
        messageProcessorRef.current.setExecutionId(newExecutionId);
        
        // Create new temporary task ID (same as main.tsx)
        const tempTaskId = `temp-${newExecutionId}`;
        
        // Set taskIdRef and currentTaskId FIRST to ensure messages are associated with the new task
        taskIdRef.current = tempTaskId;
        setCurrentTaskId(tempTaskId);
        setCurrentTaskStatus('running');
        setIsTaskRunning(true);
        
        // Use MessageProcessor to add user message (same as main.tsx)
        const updatedMessages = messageProcessorRef.current.addUserMessage(message.trim());
        
        // Create temporary task with user message (same as main.tsx)
        createTask(tempTaskId, {
          name: 'Processing...',
          messages: updatedMessages,
          status: 'running',
        });

        // Cancel any existing request (same as main.tsx)
        if (ekoRequestRef.current && taskIdRef.current) {
          try {
            await (window.api as any)?.ekoCancelTask?.(taskIdRef.current);
            await ekoRequestRef.current;
          } catch (error) {
            console.warn('Failed to cancel previous task:', error);
          }
        }

        // Run new task via EkoService (same as main.tsx)
        let result: any = null;
        if (onSendMessage) {
          await onSendMessage(message);
        } else if (typeof window !== 'undefined' && (window.api as any)?.ekoRun) {
          const request = (window.api as any).ekoRun(message.trim());
          ekoRequestRef.current = request;
          result = await request;
          ekoRequestRef.current = null;

          // Update task status based on result (same as main.tsx)
          if (result && taskIdRef.current) {
            updateTask(taskIdRef.current, {
              status: result.stopReason
            });
          }
        }
      } else {
        // Modify existing task (same as main.tsx)
        // Restore existing messages to MessageProcessor (same as main.tsx)
        const taskFromStore = tasks.find(t => t.id === taskIdRef.current);
        const existingTaskMessages = taskFromStore?.messages || currentTask?.messages || [];
        if (existingTaskMessages.length > 0) {
          messageProcessorRef.current.setMessages(existingTaskMessages);
        }
        
        // Use MessageProcessor to add user message (same as main.tsx)
        const updatedMessages = messageProcessorRef.current.addUserMessage(message.trim());
        updateMessages(taskIdRef.current!, updatedMessages);
        
        // Set existing task to running state (same as main.tsx)
        updateTask(taskIdRef.current!, { status: 'running' });

        // Cancel any existing request (same as main.tsx)
        if (ekoRequestRef.current) {
          try {
            await (window.api as any)?.ekoCancelTask?.(taskIdRef.current);
            await ekoRequestRef.current;
          } catch (error) {
            console.warn('Failed to cancel previous task:', error);
          }
        }

        // Modify task via EkoService (same as main.tsx)
        let result: any = null;
        if (typeof window !== 'undefined' && (window.api as any)?.ekoModify) {
          const request = (window.api as any).ekoModify(taskIdRef.current, message.trim());
          ekoRequestRef.current = request;
          result = await request;
          ekoRequestRef.current = null;

          // Update task status based on result (same as main.tsx)
          if (result && taskIdRef.current) {
            updateTask(taskIdRef.current, {
              status: result.stopReason
            });
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      setIsTaskRunning(false);
      setCurrentTaskStatus('error');
      
      // Set task to error state when sending fails (same as main.tsx)
      if (taskIdRef.current) {
        updateTask(taskIdRef.current, { status: 'error' });
      }

      // Show user-friendly error message
      const errorMessage = error?.message || error?.toString() || 'Failed to send message';
      antdMessage.error(errorMessage);
    } finally {
      setIsSending(false);
      // Clear ekoRequest to allow next message (same as main.tsx)
      ekoRequestRef.current = null;
    }
  }, [
    inputValue,
    isSending,
    currentTaskId,
    currentTask,
    tasks,
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

  // Handle human interaction response (same as main.tsx)
  const handleHumanResponse = useCallback(async (response: HumanResponseMessage) => {
    try {
      console.log('[LeftAgentSidebar] Sending human response:', response);
      if (typeof window !== 'undefined' && (window.api as any)?.sendHumanResponse) {
        await (window.api as any).sendHumanResponse(response);
      } else {
        console.error('[LeftAgentSidebar] sendHumanResponse API not available');
        antdMessage.error('Failed to send response - API not available');
      }
    } catch (error) {
      console.error('[LeftAgentSidebar] Failed to send human response:', error);
      antdMessage.error('Failed to send response');
    }
  }, [antdMessage]);

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
                    if (taskIdRef.current && typeof window !== 'undefined' && (window.api as any)?.ekoCancelTask) {
                      try {
                        setIsTaskRunning(false);
                        await (window.api as any).ekoCancelTask(taskIdRef.current);
                        updateTask(taskIdRef.current, {
                          status: 'error' as const,
                        });
                        ekoRequestRef.current = null;
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
        {displayMessages.length === 0 ? (
          <div className={styles.emptyState}>
            <RobotOutlined className={styles.emptyIcon} />
            <p>Start a conversation with AI Agent</p>
            <p className={styles.emptySubtext}>
              Ask questions, give commands, or start automated tasks
            </p>
          </div>
        ) : (
          <MessageList
            messages={displayMessages}
            onHumanResponse={handleHumanResponse}
          />
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
        width={320}
        zIndex={1050}
        styles={{
          wrapper: {
            zIndex: 1050,
            marginTop: '48px', // Account for header height
            height: 'calc(100vh - 48px)', // Constrain to viewport height
          },
          body: {
            padding: '16px',
            background: 'var(--background-primary)',
            height: '100%',
            overflowY: 'auto',
          },
        }}
      >
        <ModelConfigBar />
      </Drawer>
    </div>
  );
};

export default LeftAgentSidebar;

