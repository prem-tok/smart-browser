/**
 * Left Sidebar Component
 * Conversation history and navigation panel
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  Button, 
  Input, 
  List, 
  Avatar, 
  Dropdown, 
  Badge,
  Tooltip,
  Empty,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  StarOutlined,
  DeleteOutlined,
  ShareAltOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  ClockCircleOutlined,
  BookOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useLayoutStore } from '@/stores/layoutStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useTaskManager } from '@/hooks/useTaskManager';
import { Task } from '@/models';
import type { MenuProps } from 'antd';
import { formatDistanceToNow } from 'date-fns';
import styles from './LeftSidebar.module.css';

interface ConversationItem {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  isPinned: boolean;
  isBookmarked: boolean;
}

interface LeftSidebarProps {
  onNewTab?: () => void;
  onSelectConversation?: (taskId: string) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  onNewTab,
  onSelectConversation,
}) => {
  const { leftSidebarCollapsed, toggleLeftSidebar } = useLayoutStore();
  const { tasks, currentTaskId, setCurrentTaskId } = useTaskManager();
  const { selectHistoryTask } = useHistoryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'recent' | 'bookmarked'>('all');

  // Convert tasks to conversation items
  const conversations = useMemo(() => {
    return tasks
      .map((task) => {
        const lastMessage = task.messages?.[task.messages.length - 1];
        return {
          id: task.id,
          title: task.title || `Conversation ${task.id.slice(0, 8)}`,
          lastMessage: lastMessage?.content?.substring(0, 100) || 'No messages yet',
          timestamp: new Date(task.createdAt || Date.now()),
          isPinned: false, // TODO: Add pinning functionality
          isBookmarked: false, // TODO: Add bookmarking functionality
        } as ConversationItem;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [tasks]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (conv) =>
          conv.title.toLowerCase().includes(query) ||
          conv.lastMessage.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (filter === 'recent') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filtered = filtered.filter((conv) => conv.timestamp > sevenDaysAgo);
    } else if (filter === 'bookmarked') {
      filtered = filtered.filter((conv) => conv.isBookmarked);
    }

    return filtered;
  }, [conversations, searchQuery, filter]);

  // Group conversations by date
  const groupedConversations = useMemo(() => {
    const groups: Record<string, ConversationItem[]> = {
      today: [],
      yesterday: [],
      'last7days': [],
      older: [],
    };

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    filteredConversations.forEach((conv) => {
      if (conv.timestamp >= new Date(now.setHours(0, 0, 0, 0))) {
        groups.today.push(conv);
      } else if (conv.timestamp >= new Date(yesterday.setHours(0, 0, 0, 0))) {
        groups.yesterday.push(conv);
      } else if (conv.timestamp >= sevenDaysAgo) {
        groups.last7days.push(conv);
      } else {
        groups.older.push(conv);
      }
    });

    return groups;
  }, [filteredConversations]);

  const handleConversationClick = useCallback((taskId: string) => {
    setCurrentTaskId(taskId);
    selectHistoryTask(tasks.find((t) => t.id === taskId) || null);
    onSelectConversation?.(taskId);
  }, [setCurrentTaskId, selectHistoryTask, tasks, onSelectConversation]);

  const handleNewTab = useCallback(() => {
    onNewTab?.();
  }, [onNewTab]);

  // Conversation item menu
  const getConversationMenu = (conversation: ConversationItem): MenuProps => ({
    items: [
      {
        key: 'pin',
        label: conversation.isPinned ? 'Unpin' : 'Pin',
        icon: <StarOutlined />,
      },
      {
        key: 'bookmark',
        label: conversation.isBookmarked ? 'Remove bookmark' : 'Bookmark',
        icon: <BookOutlined />,
      },
      {
        key: 'share',
        label: 'Share',
        icon: <ShareAltOutlined />,
      },
      {
        type: 'divider',
      },
      {
        key: 'delete',
        label: 'Delete',
        icon: <DeleteOutlined />,
        danger: true,
      },
    ],
    onClick: ({ key }) => {
      // TODO: Implement actions
      console.log(`Action: ${key} for conversation ${conversation.id}`);
    },
  });

  // Render conversation item
  const renderConversationItem = (conversation: ConversationItem) => {
    const isActive = conversation.id === currentTaskId;
    const timeAgo = formatDistanceToNow(conversation.timestamp, { addSuffix: true });

    return (
      <div
        className={`${styles.conversationItem} ${isActive ? styles.active : ''}`}
        onClick={() => handleConversationClick(conversation.id)}
      >
        <div className={styles.conversationContent}>
          <div className={styles.conversationHeader}>
            <span className={styles.conversationTitle}>{conversation.title}</span>
            {conversation.isPinned && (
              <StarOutlined className={styles.pinnedIcon} />
            )}
          </div>
          <div className={styles.conversationPreview}>{conversation.lastMessage}</div>
          <div className={styles.conversationMeta}>
            <ClockCircleOutlined className={styles.metaIcon} />
            <span className={styles.metaText}>{timeAgo}</span>
          </div>
        </div>
        <Dropdown
          menu={getConversationMenu(conversation)}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="text"
            icon={<MoreOutlined />}
            className={styles.conversationActions}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>
    );
  };

  // Render conversation group
  const renderConversationGroup = (title: string, conversations: ConversationItem[]) => {
    if (conversations.length === 0) return null;

    return (
      <div className={styles.conversationGroup}>
        <div className={styles.groupTitle}>{title}</div>
        {conversations.map((conv) => (
          <div key={conv.id}>{renderConversationItem(conv)}</div>
        ))}
      </div>
    );
  };

  if (leftSidebarCollapsed) {
    return (
      <div className={styles.sidebarCollapsed}>
        <Tooltip title="Expand sidebar" placement="right">
          <Button
            type="text"
            icon={<MenuUnfoldOutlined />}
            onClick={toggleLeftSidebar}
            className={styles.collapseButton}
          />
        </Tooltip>
        <Tooltip title="New tab" placement="right">
          <Button
            type="text"
            icon={<PlusOutlined />}
            onClick={handleNewTab}
            className={styles.iconButton}
          />
        </Tooltip>
        <Tooltip title="Settings" placement="right">
          <Button
            type="text"
            icon={<SettingOutlined />}
            className={styles.iconButton}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      {/* Top Section */}
      <div className={styles.topSection}>
        <div className={styles.topHeader}>
          <Button
            type="text"
            icon={<MenuFoldOutlined />}
            onClick={toggleLeftSidebar}
            className={styles.collapseButton}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleNewTab}
            className={styles.newTabButton}
          >
            New Tab
          </Button>
        </div>

        {/* Search */}
        <Input
          placeholder="Search conversations..."
          prefix={<SearchOutlined />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
          allowClear
        />

        {/* Filters */}
        <div className={styles.filters}>
          <Button
            type={filter === 'all' ? 'primary' : 'text'}
            size="small"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            type={filter === 'recent' ? 'primary' : 'text'}
            size="small"
            onClick={() => setFilter('recent')}
          >
            Recent
          </Button>
          <Button
            type={filter === 'bookmarked' ? 'primary' : 'text'}
            size="small"
            icon={<StarOutlined />}
            onClick={() => setFilter('bookmarked')}
          >
            Bookmarked
          </Button>
        </div>
      </div>

      {/* Conversation List */}
      <div className={styles.conversationList}>
        {filteredConversations.length === 0 ? (
          <Empty
            description="No conversations found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            className={styles.emptyState}
          />
        ) : (
          <>
            {renderConversationGroup('Today', groupedConversations.today)}
            {renderConversationGroup('Yesterday', groupedConversations.yesterday)}
            {renderConversationGroup('Last 7 Days', groupedConversations.last7days)}
            {renderConversationGroup('Older', groupedConversations.older)}
          </>
        )}
      </div>

      {/* Bottom Section */}
      <div className={styles.bottomSection}>
        <div className={styles.bottomActions}>
          <Tooltip title="Settings">
            <Button
              type="text"
              icon={<SettingOutlined />}
              className={styles.bottomButton}
            />
          </Tooltip>
          <Tooltip title="Privacy Settings">
            <Button
              type="text"
              icon={<LockOutlined />}
              className={styles.bottomButton}
            />
          </Tooltip>
        </div>
        <div className={styles.userSection}>
          <Avatar size="small" className={styles.userAvatar}>
            U
          </Avatar>
          <div className={styles.userInfo}>
            <div className={styles.userName}>User</div>
            <Badge status="success" text="Free" className={styles.planBadge} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftSidebar;

