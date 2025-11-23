/**
 * Chat Hook
 * Manages AI chat state and interactions
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  error?: string;
  metadata?: {
    toolCalls?: any[];
    attachments?: any[];
    [key: string]: any;
  };
}

interface UseChatOptions {
  onSendMessage?: (message: string) => Promise<void>;
  onStopGeneration?: () => void;
  initialMessages?: ChatMessage[];
}

export function useChat(options: UseChatOptions = {}) {
  const { onSendMessage, onStopGeneration, initialMessages = [] } = options;
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Add message
  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage.id;
  }, []);

  // Update message
  const updateMessage = useCallback((messageId: string, updates: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
    );
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (content?: string) => {
      const messageContent = content || input.trim();
      if (!messageContent || isLoading) return;

      // Add user message
      const userMessageId = addMessage({
        role: 'user',
        content: messageContent,
      });

      // Clear input
      setInput('');

      // Add loading assistant message
      const assistantMessageId = addMessage({
        role: 'assistant',
        content: '',
        isLoading: true,
      });

      setIsLoading(true);
      setIsStreaming(true);

      try {
        if (onSendMessage) {
          await onSendMessage(messageContent);
        }
      } catch (error) {
        updateMessage(assistantMessageId, {
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to send message',
        });
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [input, isLoading, addMessage, updateMessage, onSendMessage]
  );

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
    onStopGeneration?.();
  }, [onStopGeneration]);

  // Append to assistant message (for streaming)
  const appendToMessage = useCallback((messageId: string, content: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === messageId && msg.role === 'assistant') {
          return {
            ...msg,
            content: msg.content + content,
            isLoading: false,
          };
        }
        return msg;
      })
    );
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Delete message
  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  }, []);

  // Retry last message
  const retryLastMessage = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user');
    if (lastUserMessage) {
      // Remove last assistant message if it exists
      const lastAssistantIndex = messages.findIndex(
        (msg, index) => index > messages.indexOf(lastUserMessage) && msg.role === 'assistant'
      );
      if (lastAssistantIndex !== -1) {
        setMessages((prev) => prev.slice(0, lastAssistantIndex));
      }
      sendMessage(lastUserMessage.content);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    sendMessage,
    stopGeneration,
    addMessage,
    updateMessage,
    appendToMessage,
    clearMessages,
    deleteMessage,
    retryLastMessage,
  };
}

