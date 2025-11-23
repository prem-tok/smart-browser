/**
 * Embedded AI Agent Component
 * Floating AI assistant panel embedded in browser view
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Button,
  Input,
  Avatar,
  Badge,
  Space,
  Typography,
  Tooltip,
} from 'antd';
import {
  SendOutlined,
  CloseOutlined,
  MinusOutlined,
  ExpandOutlined,
  RobotOutlined,
  UserOutlined,
  PauseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useTaskManager } from '@/hooks/useTaskManager';
import { useAgentMode } from '@/hooks/useAgentMode';
import styles from './EmbeddedAIAgent.module.css';

const { TextArea } = Input;
const { Text } = Typography;

interface EmbeddedAIAgentProps {
  minimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  agentModeActive?: boolean;
}

const EmbeddedAIAgent: React.FC<EmbeddedAIAgentProps> = ({
  minimized = false,
  onMinimize,
  onMaximize,
  onClose,
  agentModeActive = false,
}) => {
  const { currentTask, messages } = useTaskManager();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    isActive: agentActive,
    isPaused: agentPaused,
    pause: pauseAgent,
    resume: resumeAgent,
    stop: stopAgent,
  } = useAgentMode();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!input.trim() || isSending) return;

    const message = input.trim();
    setInput('');
    setIsSending(true);

    try {
      if (typeof window !== 'undefined' && (window.api as any)?.ekoRun) {
        await (window.api as any).ekoRun(message);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending]);

  // Handle key press
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className={`${styles.embeddedAgent} ${minimized ? styles.minimized : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Avatar icon={<RobotOutlined />} size="small" className={styles.avatar} />
          <div className={styles.headerInfo}>
            <Text strong className={styles.title}>
              AI Assistant
            </Text>
            {agentModeActive && (
              <Badge status="processing" text="Agent Active" className={styles.badge} />
            )}
          </div>
        </div>
        <Space>
          {agentModeActive && (
            <>
              {agentPaused ? (
                <Tooltip title="Resume">
                  <Button
                    type="text"
                    size="small"
                    icon={<ExpandOutlined />}
                    onClick={resumeAgent}
                  />
                </Tooltip>
              ) : (
                <Tooltip title="Pause">
                  <Button
                    type="text"
                    size="small"
                    icon={<PauseCircleOutlined />}
                    onClick={pauseAgent}
                  />
                </Tooltip>
              )}
              <Tooltip title="Stop">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={stopAgent}
                />
              </Tooltip>
            </>
          )}
          {minimized ? (
            <Tooltip title="Maximize">
              <Button
                type="text"
                size="small"
                icon={<ExpandOutlined />}
                onClick={onMaximize}
              />
            </Tooltip>
          ) : (
            <Tooltip title="Minimize">
              <Button
                type="text"
                size="small"
                icon={<MinusOutlined />}
                onClick={onMinimize}
              />
            </Tooltip>
          )}
          <Tooltip title="Close">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
            />
          </Tooltip>
        </Space>
      </div>

      {/* Messages */}
      {!minimized && (
        <>
          <div className={styles.messages}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                <RobotOutlined className={styles.emptyIcon} />
                <Text type="secondary">Ask me anything or start a task</Text>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`${styles.message} ${
                    message.role === 'user' ? styles.userMessage : styles.assistantMessage
                  }`}
                >
                  <Avatar
                    icon={message.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                    size="small"
                    className={styles.messageAvatar}
                  />
                  <div className={styles.messageContent}>
                    <div className={styles.messageText}>{message.content}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <TextArea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask AI or enter command..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              className={styles.input}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={isSending}
              disabled={!input.trim()}
              className={styles.sendButton}
            >
              Send
            </Button>
          </div>
        </>
      )}

      {/* Minimized View */}
      {minimized && (
        <div className={styles.minimizedContent}>
          <Text type="secondary" className={styles.minimizedText}>
            {messages.length > 0
              ? messages[messages.length - 1].content.substring(0, 50) + '...'
              : 'AI Assistant ready'}
          </Text>
        </div>
      )}
    </div>
  );
};

export default EmbeddedAIAgent;

