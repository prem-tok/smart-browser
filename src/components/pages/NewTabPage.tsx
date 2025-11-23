/**
 * New Tab Page Component
 * ChatGPT Atlas inspired new tab interface
 */

import React, { useState, useCallback } from 'react';
import { Input, Button, Card, Badge } from 'antd';
import {
  SearchOutlined,
  ImageOutlined,
  CodeOutlined,
  BarChartOutlined,
  StarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import styles from './NewTabPage.module.css';

interface NewTabPageProps {
  onSearch?: (query: string) => void;
  onNavigate?: (url: string) => void;
  recentConversations?: Array<{
    id: string;
    title: string;
    timestamp: Date;
  }>;
  bookmarks?: Array<{
    id: string;
    title: string;
    url: string;
  }>;
}

export const NewTabPage: React.FC<NewTabPageProps> = ({
  onSearch,
  onNavigate,
  recentConversations = [],
  bookmarks = [],
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'search' | 'images' | 'videos' | 'news'>('search');

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch?.(searchQuery.trim());
    }
  }, [searchQuery, onSearch]);

  const quickActions = [
    { icon: <SearchOutlined />, label: 'Search the web', action: () => onSearch?.(searchQuery) },
    { icon: <ImageOutlined />, label: 'Generate image', action: () => setActiveTab('images') },
    { icon: <CodeOutlined />, label: 'Write code', action: () => onSearch?.('write code') },
    { icon: <BarChartOutlined />, label: 'Analyze data', action: () => onSearch?.('analyze data') },
  ];

  return (
    <div className={styles.newTabPage}>
      {/* Background */}
      <div className={styles.background} />

      {/* Content */}
      <div className={styles.content}>
        {/* Logo/Branding */}
        <div className={styles.logoSection}>
          <h1 className={styles.logo}>ChatGPT Atlas</h1>
          <p className={styles.tagline}>Your AI-powered browser</p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className={styles.searchSection}>
          <Input
            size="large"
            placeholder="Ask ChatGPT or enter URL"
            prefix={<SearchOutlined />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            autoFocus
          />
        </form>

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          {quickActions.map((action, index) => (
            <Button
              key={index}
              type="text"
              icon={action.icon}
              onClick={action.action}
              className={styles.quickActionButton}
            >
              {action.label}
            </Button>
          ))}
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <Button
            type={activeTab === 'search' ? 'primary' : 'text'}
            onClick={() => setActiveTab('search')}
            className={styles.tabButton}
          >
            Search
          </Button>
          <Button
            type={activeTab === 'images' ? 'primary' : 'text'}
            onClick={() => setActiveTab('images')}
            className={styles.tabButton}
          >
            Images
          </Button>
          <Button
            type={activeTab === 'videos' ? 'primary' : 'text'}
            onClick={() => setActiveTab('videos')}
            className={styles.tabButton}
          >
            Videos
          </Button>
          <Button
            type={activeTab === 'news' ? 'primary' : 'text'}
            onClick={() => setActiveTab('news')}
            className={styles.tabButton}
          >
            News
          </Button>
        </div>

        {/* Recent Conversations */}
        {recentConversations.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Recent Conversations</h3>
            <div className={styles.conversationGrid}>
              {recentConversations.slice(0, 4).map((conv) => (
                <Card
                  key={conv.id}
                  hoverable
                  className={styles.conversationCard}
                  onClick={() => onNavigate?.(`/conversation/${conv.id}`)}
                >
                  <div className={styles.conversationCardContent}>
                    <div className={styles.conversationCardTitle}>{conv.title}</div>
                    <div className={styles.conversationCardMeta}>
                      <ClockCircleOutlined />
                      <span>{new Date(conv.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Bookmarks */}
        {bookmarks.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <StarOutlined /> Bookmarks
            </h3>
            <div className={styles.bookmarkList}>
              {bookmarks.slice(0, 6).map((bookmark) => (
                <Button
                  key={bookmark.id}
                  type="text"
                  className={styles.bookmarkItem}
                  onClick={() => onNavigate?.(bookmark.url)}
                >
                  {bookmark.title}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewTabPage;

