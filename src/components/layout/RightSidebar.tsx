/**
 * Right Sidebar Component
 * AI Assistant / Ask ChatGPT panel
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Button,
  Input,
  Avatar,
  Tooltip,
  Badge,
  Progress,
  Spin,
} from 'antd';
import {
  CloseOutlined,
  SendOutlined,
  CameraOutlined,
  AudioOutlined,
  RobotOutlined,
  PauseCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useLayoutStore } from '@/stores/layoutStore';
import styles from './RightSidebar.module.css';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isCode?: boolean;
  language?: string;
}

interface RightSidebarProps {
  messages?: Message[];
  isLoading?: boolean;
  agentModeActive?: boolean;
  agentActivity?: string;
  agentProgress?: number;
  onSendMessage?: (message: string) => void;
  onAttachScreenshot?: () => void;
  onVoiceInput?: () => void;
  onPauseAgent?: () => void;
  onStopAgent?: () => void;
  pageContext?: {
    title?: string;
    url?: string;
  };
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  messages = [],
  isLoading = false,
  agentModeActive = false,
  agentActivity,
  agentProgress,
  onSendMessage,
  onAttachScreenshot,
  onVoiceInput,
  onPauseAgent,
  onStopAgent,
  pageContext,
}) => {
  const { rightSidebarOpen, setRightSidebarOpen } = useLayoutStore();
  const [inputValue, setInputValue] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle send message
  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    
    onSendMessage?.(inputValue.trim());
    setInputValue('');
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [inputValue, isLoading, onSendMessage]);

  // Handle input key press
  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    
    // Auto-resize
    e.target.style.height = 'auto';
    const newHeight = Math.min(e.target.scrollHeight, 120); // Max 4 lines
    e.target.style.height = `${newHeight}px`;
  }, []);

  // Format message content
  const formatMessageContent = (content: string, isCode?: boolean, language?: string) => {
    if (isCode && language) {
      return (
        <pre className={styles.codeBlock}>
          <code className={`language-${language}`}>{content}</code>
        </pre>
      );
    }
    return <div className={styles.messageText}>{content}</div>;
  };

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  if (!rightSidebarOpen) {
    return null;
  }

  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            <RobotOutlined className={styles.headerIcon} />
            <span>Ask ChatGPT</span>
          </div>
          {pageContext && (
            <div className={styles.pageContext}>
              <span className={styles.pageContextTitle} title={pageContext.title}>
                {pageContext.title || 'Current Page'}
              </span>
            </div>
          )}
        </div>
        <Tooltip title="Close sidebar">
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setRightSidebarOpen(false)}
            className={styles.closeButton}
          />
        </Tooltip>
      </div>

      {/* Agent Mode Panel */}
      {agentModeActive && (
        <div className={styles.agentPanel}>
          <div className={styles.agentHeader}>
            <Badge status="processing" text="Agent Mode Active" />
            <div className={styles.agentActions}>
              {onPauseAgent && (
                <Tooltip title="Pause">
                  <Button
                    type="text"
                    icon={<PauseCircleOutlined />}
                    size="small"
                    onClick={onPauseAgent}
                  />
                </Tooltip>
              )}
              {onStopAgent && (
                <Tooltip title="Stop">
                  <Button
                    type="text"
                    icon={<StopOutlined />}
                    size="small"
                    danger
                    onClick={onStopAgent}
                  />
                </Tooltip>
              )}
            </div>
          </div>
          {agentActivity && (
            <div className={styles.agentActivity}>
              <Spin size="small" />
              <span>{agentActivity}</span>
            </div>
          )}
          {agentProgress !== undefined && (
            <Progress
              percent={agentProgress}
              size="small"
              showInfo={false}
              className={styles.agentProgress}
            />
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className={styles.quickActions}>
        <Button
          type="text"
          size="small"
          onClick={() => onSendMessage?.('Summarize this page')}
        >
          Summarize this page
        </Button>
        <Button
          type="text"
          size="small"
          onClick={() => onSendMessage?.('Ask about selection')}
        >
          Ask about selection
        </Button>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <RobotOutlined className={styles.emptyIcon} />
            <p>Start a conversation with ChatGPT</p>
            <p className={styles.emptySubtext}>
              Ask questions about the current page or get help with browsing
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.message} ${styles[`message${message.role}`]}`}
            >
              <Avatar
                size="small"
                className={styles.messageAvatar}
                icon={message.role === 'user' ? <span>U</span> : <RobotOutlined />}
              />
              <div className={styles.messageContent}>
                {formatMessageContent(message.content, message.isCode, message.language)}
                <div className={styles.messageTimestamp}>
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
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
        <div className={styles.inputActions}>
          {onAttachScreenshot && (
            <Tooltip title="Attach screenshot">
              <Button
                type="text"
                icon={<CameraOutlined />}
                size="small"
                onClick={onAttachScreenshot}
                className={styles.inputActionButton}
              />
            </Tooltip>
          )}
          {onVoiceInput && (
            <Tooltip title="Voice input">
              <Button
                type="text"
                icon={<AudioOutlined />}
                size="small"
                onClick={onVoiceInput}
                className={styles.inputActionButton}
              />
            </Tooltip>
          )}
        </div>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            placeholder="Ask ChatGPT..."
            className={styles.input}
            rows={1}
            disabled={isLoading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className={styles.sendButton}
          />
        </div>
      </div>
    </div>
  );
};

export default RightSidebar;

