/**
 * Enhanced Address Bar (Omnibox) Component
 * Smart autocomplete with fuzzy matching, multiple suggestion sources, and advanced features
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Input,
  Button,
  Tooltip,
  Dropdown,
  Modal,
  Space,
  Typography,
} from 'antd';
import {
  SearchOutlined,
  LockOutlined,
  InfoCircleOutlined,
  StarOutlined,
  HistoryOutlined,
  MessageOutlined,
  FileTextOutlined,
  GlobalOutlined,
  ShareAltOutlined,
  QrcodeOutlined,
  TranslationOutlined,
  EnterOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import Fuse from 'fuse.js';
import { QRCodeSVG } from 'qrcode.react';
import type { Tab } from '@/hooks/useTabs';
import { useTaskManager } from '@/hooks/useTaskManager';
import styles from './AddressBar.module.css';

const { Text } = Typography;

export interface Suggestion {
  id: string;
  type: 'history' | 'bookmark' | 'conversation' | 'tab' | 'search';
  title: string;
  url?: string;
  description?: string;
  favicon?: string;
  timestamp?: Date;
  score?: number;
}

interface AddressBarProps {
  currentUrl?: string;
  isLoading?: boolean;
  tabs?: Tab[];
  onNavigate?: (url: string) => void;
  onBookmark?: () => void;
  onAskChatGPT?: () => void;
  securityLevel?: 'secure' | 'insecure' | 'unknown';
}

interface PageAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const AddressBar: React.FC<AddressBarProps> = ({
  currentUrl = '',
  isLoading = false,
  tabs = [],
  onNavigate,
  onBookmark,
  onAskChatGPT,
  securityLevel = 'unknown',
}) => {
  const { tasks } = useTaskManager();
  const [inputValue, setInputValue] = useState(currentUrl);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isEditing, setIsEditing] = useState(false);
  const [showPageActions, setShowPageActions] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Update input when URL changes (but not while editing)
  useEffect(() => {
    if (!isEditing && !showSuggestions) {
      setInputValue(currentUrl);
    }
  }, [currentUrl, isEditing, showSuggestions]);

  // Load suggestions from multiple sources
  const loadSuggestions = useCallback(
    (query: string): Suggestion[] => {
      if (!query.trim()) {
        // Show recent items when empty
        return getRecentSuggestions();
      }

      const allSuggestions: Suggestion[] = [];

      // History suggestions (from tasks with lastUrl)
      const historyItems = tasks
        .filter((task) => task.lastUrl)
        .map((task) => ({
          id: `history-${task.id}`,
          type: 'history' as const,
          title: task.name || 'Untitled',
          url: task.lastUrl!,
          description: formatDate(new Date(task.updatedAt)),
          timestamp: new Date(task.updatedAt),
        }));

      // Bookmark suggestions (from localStorage or IPC)
      const bookmarks = getBookmarks();

      // Conversation suggestions (from tasks)
      const conversationItems = tasks.map((task) => ({
        id: `conv-${task.id}`,
        type: 'conversation' as const,
        title: task.name || `Conversation ${task.id.slice(0, 8)}`,
        description: task.messages?.[0]?.content?.substring(0, 50) || 'No messages',
        timestamp: new Date(task.createdAt),
      }));

      // Open tabs suggestions
      const tabItems = tabs.map((tab) => ({
        id: `tab-${tab.id}`,
        type: 'tab' as const,
        title: tab.title || 'New Tab',
        url: tab.url,
        favicon: tab.favicon,
      }));

      // Search suggestions
      const searchItems: Suggestion[] = [];
      if (query.length > 0) {
        // Check for search shortcuts
        if (query.startsWith('?')) {
          searchItems.push({
            id: 'search-chatgpt',
            type: 'search',
            title: `Search ChatGPT: ${query.slice(1)}`,
            description: 'Ask ChatGPT',
          });
        } else if (query.startsWith('!')) {
          searchItems.push({
            id: 'search-duckduckgo',
            type: 'search',
            title: `Search DuckDuckGo: ${query.slice(1)}`,
            description: 'DuckDuckGo search',
          });
        } else {
          // Regular search
          searchItems.push({
            id: 'search-google',
            type: 'search',
            title: `Search Google: ${query}`,
            description: 'Google search',
          });
        }
      }

      // Combine all suggestions
      allSuggestions.push(...historyItems, ...bookmarks, ...conversationItems, ...tabItems, ...searchItems);

      // Fuzzy search with Fuse.js
      const fuse = new Fuse(allSuggestions, {
        keys: ['title', 'url', 'description'],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 1,
      });

      const results = fuse.search(query);
      return results
        .map((result) => ({
          ...result.item,
          score: result.score,
        }))
        .slice(0, 10); // Limit to 10 suggestions
    },
    [tasks, tabs]
  );

  // Get recent suggestions (when input is empty)
  const getRecentSuggestions = useCallback((): Suggestion[] => {
    const recent: Suggestion[] = [];

    // Recent history (last 5)
    const recentHistory = tasks
      .filter((task) => task.lastUrl)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
      .map((task) => ({
        id: `history-${task.id}`,
        type: 'history' as const,
        title: task.name || 'Untitled',
        url: task.lastUrl!,
        description: formatDate(new Date(task.updatedAt)),
      }));

    // Recent conversations (last 3)
    const recentConversations = tasks
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
      .map((task) => ({
        id: `conv-${task.id}`,
        type: 'conversation' as const,
        title: task.name || `Conversation ${task.id.slice(0, 8)}`,
        description: task.messages?.[0]?.content?.substring(0, 50) || 'No messages',
      }));

    recent.push(...recentHistory, ...recentConversations);
    return recent;
  }, [tasks]);

  // Get bookmarks (from localStorage or IPC)
  const getBookmarks = useCallback((): Suggestion[] => {
    try {
      const stored = localStorage.getItem('browser-bookmarks');
      if (stored) {
        const bookmarks = JSON.parse(stored);
        return bookmarks.map((bm: any) => ({
          id: `bookmark-${bm.id || bm.url}`,
          type: 'bookmark' as const,
          title: bm.title || bm.url,
          url: bm.url,
          favicon: bm.favicon,
        }));
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    }
    return [];
  }, []);

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      setIsEditing(true);
      setSelectedIndex(-1);

      if (value.trim()) {
        const newSuggestions = loadSuggestions(value);
        setSuggestions(newSuggestions);
        setShowSuggestions(true);
      } else {
        const recent = getRecentSuggestions();
        setSuggestions(recent);
        setShowSuggestions(true);
      }
    },
    [loadSuggestions, getRecentSuggestions]
  );

  // Handle input focus
  const handleInputFocus = useCallback(() => {
    setShowSuggestions(true);
    setShowPageActions(true);
    if (suggestions.length === 0) {
      const recent = getRecentSuggestions();
      setSuggestions(recent);
    }
  }, [suggestions.length, getRecentSuggestions]);

  // Handle input blur
  const handleInputBlur = useCallback(() => {
    // Delay to allow click on suggestions
    setTimeout(() => {
      setShowSuggestions(false);
      setShowPageActions(false);
      setIsEditing(false);
    }, 200);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions || suggestions.length === 0) {
        if (e.key === 'Enter') {
          handleSubmit();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Tab':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            handleSuggestionSelect(suggestions[selectedIndex]);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            handleSuggestionSelect(suggestions[selectedIndex]);
          } else {
            handleSubmit();
          }
          break;
        case 'Escape':
          setShowSuggestions(false);
          setSelectedIndex(-1);
          inputRef.current?.blur();
          break;
      }
    },
    [showSuggestions, suggestions, selectedIndex]
  );

  // Handle suggestion select
  const handleSuggestionSelect = useCallback(
    (suggestion: Suggestion) => {
      setShowSuggestions(false);
      setSelectedIndex(-1);

      if (suggestion.type === 'search') {
        let searchUrl = '';
        if (suggestion.id === 'search-chatgpt') {
          const query = inputValue.startsWith('?') ? inputValue.slice(1) : inputValue;
          onAskChatGPT?.();
          return;
        } else if (suggestion.id === 'search-duckduckgo') {
          const query = inputValue.startsWith('!') ? inputValue.slice(1) : inputValue;
          searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        } else {
          searchUrl = `https://www.google.com/search?q=${encodeURIComponent(inputValue)}`;
        }
        onNavigate?.(searchUrl);
      } else if (suggestion.url) {
        onNavigate?.(suggestion.url);
      } else if (suggestion.type === 'conversation') {
        // Navigate to conversation (could open in sidebar or new tab)
        const taskId = suggestion.id.replace('conv-', '');
        // TODO: Handle conversation navigation
      }

      setInputValue(suggestion.url || suggestion.title);
    },
    [inputValue, onNavigate, onAskChatGPT]
  );

  // Handle form submit
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      setShowSuggestions(false);
      setIsEditing(false);

      let url = inputValue.trim();

      // Handle search shortcuts
      if (url.startsWith('?')) {
        onAskChatGPT?.();
        return;
      } else if (url.startsWith('!')) {
        url = `https://duckduckgo.com/?q=${encodeURIComponent(url.slice(1))}`;
      } else if (!url.match(/^https?:\/\//i)) {
        if (url.includes('.')) {
          url = `https://${url}`;
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
      }

      onNavigate?.(url);
    },
    [inputValue, onNavigate, onAskChatGPT]
  );

  // Handle paste & go (Ctrl+V or Cmd+V)
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData('text');
      if (pastedText && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setInputValue(pastedText);
        // Auto-submit after paste
        setTimeout(() => {
          handleSubmit();
        }, 100);
      }
    },
    [handleSubmit]
  );

  // Get suggestion icon
  const getSuggestionIcon = (suggestion: Suggestion) => {
    switch (suggestion.type) {
      case 'history':
        return <HistoryOutlined className={styles.suggestionIcon} />;
      case 'bookmark':
        return <StarOutlined className={styles.suggestionIcon} />;
      case 'conversation':
        return <MessageOutlined className={styles.suggestionIcon} />;
      case 'tab':
        return suggestion.favicon ? (
          <img src={suggestion.favicon} alt="" className={styles.suggestionFavicon} />
        ) : (
          <FileTextOutlined className={styles.suggestionIcon} />
        );
      case 'search':
        return <SearchOutlined className={styles.suggestionIcon} />;
      default:
        return <GlobalOutlined className={styles.suggestionIcon} />;
    }
  };

  // Get security indicator
  const getSecurityIndicator = () => {
    switch (securityLevel) {
      case 'secure':
        return <LockOutlined className={styles.securityIcon} />;
      case 'insecure':
        return <InfoCircleOutlined className={styles.securityIcon} style={{ color: '#f59e0b' }} />;
      default:
        return null;
    }
  };

  // Page actions
  const pageActions: PageAction[] = useMemo(
    () => [
      {
        id: 'translate',
        label: 'Translate page',
        icon: <TranslationOutlined />,
        onClick: () => {
          // TODO: Implement translate
          console.log('Translate page');
        },
      },
      {
        id: 'share',
        label: 'Share page',
        icon: <ShareAltOutlined />,
        onClick: () => {
          if (navigator.share) {
            navigator.share({
              title: document.title,
              url: currentUrl,
            });
          }
        },
      },
      {
        id: 'qrcode',
        label: 'Show QR code',
        icon: <QrcodeOutlined />,
        onClick: () => setShowQRCode(true),
      },
    ],
    [currentUrl]
  );

  // Format date
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  return (
    <div className={styles.addressBarContainer}>
      <form onSubmit={handleSubmit} className={styles.addressBarForm}>
        <div className={`${styles.addressBar} ${showSuggestions || showPageActions ? styles.focused : ''}`}>
          {getSecurityIndicator()}
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Search or enter URL"
            className={styles.addressInput}
            prefix={<SearchOutlined className={styles.addressBarIcon} />}
            suffix={
              <div className={styles.addressBarActions}>
                {showPageActions && currentUrl && (
                  <Space size={4}>
                    {pageActions.map((action) => (
                      <Tooltip key={action.id} title={action.label}>
                        <Button
                          type="text"
                          icon={action.icon}
                          size="small"
                          className={styles.pageActionButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            action.onClick();
                          }}
                        />
                      </Tooltip>
                    ))}
                  </Space>
                )}
                {onBookmark && (
                  <Tooltip title="Bookmark">
                    <Button
                      type="text"
                      icon={<StarOutlined />}
                      size="small"
                      className={styles.addressBarButton}
                      onClick={onBookmark}
                    />
                  </Tooltip>
                )}
                {onAskChatGPT && (
                  <Tooltip title="Ask ChatGPT">
                    <Button
                      type="text"
                      icon={<SearchOutlined />}
                      size="small"
                      className={styles.addressBarButton}
                      onClick={onAskChatGPT}
                    />
                  </Tooltip>
                )}
              </div>
            }
          />
        </div>
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div ref={suggestionsRef} className={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.id}
              className={`${styles.suggestionItem} ${index === selectedIndex ? styles.selected : ''}`}
              onClick={() => handleSuggestionSelect(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className={styles.suggestionIconContainer}>
                {getSuggestionIcon(suggestion)}
              </div>
              <div className={styles.suggestionContent}>
                <div className={styles.suggestionTitle}>{suggestion.title}</div>
                {suggestion.description && (
                  <div className={styles.suggestionDescription}>{suggestion.description}</div>
                )}
                {suggestion.url && (
                  <div className={styles.suggestionUrl}>{suggestion.url}</div>
                )}
              </div>
              {index === selectedIndex && (
                <EnterOutlined className={styles.suggestionEnter} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* QR Code Modal */}
      <Modal
        title="QR Code"
        open={showQRCode}
        onCancel={() => setShowQRCode(false)}
        footer={null}
        width={300}
      >
        <div className={styles.qrCodeContainer}>
          <QRCodeSVG value={currentUrl} size={256} />
          <Text type="secondary" style={{ display: 'block', marginTop: 16, textAlign: 'center' }}>
            {currentUrl}
          </Text>
        </div>
      </Modal>
    </div>
  );
};

export default AddressBar;

